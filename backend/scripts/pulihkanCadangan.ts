// Pulihkan database HPP dari berkas cadangan (hpp-*.json.gz buatan src/lib/cadangan.ts).
//
// BAWAAN-NYA CUMA MEMBANDINGKAN, TIDAK MENULIS APA PUN. Pemulihan sungguhan
// menimpa SELURUH isi database HPP dengan isi berkas -- semua yang dibuat
// sesudah berkas itu ikut hilang. Itu persis jenis kejadian yang mau dicegah
// (15 Sep 2026), jadi skrip ini sengaja merepotkan:
//   - tanpa --jalankan: cuma menampilkan perbandingan jumlah baris;
//   - dengan --jalankan: SEBELUM menimpa, membuat cadangan keadaan sekarang
//     dulu (sumber "sebelum-pulih"), jadi pemulihan yang salah pun masih bisa
//     dibatalkan dengan memulihkan berkas itu.
//
// Pakai (di server, folder backend):
//   npm run pulihkan -- cadangan/hpp-20260922-023000.json.gz            (lihat saja)
//   npm run pulihkan -- cadangan/hpp-20260922-023000.json.gz --jalankan (timpa)
// Berkas yang diunduh dari aplikasi (Pengaturan > Cadangan data) bisa diunggah
// ke server lalu dipakai dengan cara yang sama.
import fs from 'fs';
import zlib from 'zlib';
import { prisma } from '../src/db/prisma';
import { TABEL, buatCadangan, terimaKeadaanSekarang } from '../src/lib/cadangan';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const jalankan = args.includes('--jalankan');
  if (!file || !fs.existsSync(file)) {
    console.error('Berkas cadangan tidak ditemukan. Contoh: npm run pulihkan -- cadangan/hpp-20260922-023000.json.gz');
    process.exit(1);
  }

  const isi = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  if (isi.aplikasi !== 'elio-hpp' || !isi.data) {
    console.error('Ini bukan berkas cadangan HPP Elio.');
    process.exit(1);
  }

  console.log(`Berkas  : ${file}`);
  console.log(`Dibuat  : ${isi.dibuat}${isi.mundur ? '   (!) dibuat saat database terdeteksi MUNDUR' : ''}\n`);
  // Tabel yang TIDAK ikut tercadang (gagal dibaca saat cadangan dibuat, atau
  // berkas versi lama yang belum punya tabelnya) dilewati sepenuhnya: tidak
  // dikosongkan, tidak diisi. Mengosongkannya berarti menghapus data yang
  // sebenarnya tidak ada gantinya di berkas.
  const ikut = (t: string) => Array.isArray(isi.data[t]) && !(isi.gagal && isi.gagal[t]);
  console.log('tabel'.padEnd(26) + 'sekarang'.padStart(10) + 'di berkas'.padStart(11));
  for (const t of TABEL) {
    let kini = '?';
    try { kini = String(await (prisma as any)[t].count()); } catch { kini = 'rusak'; }
    if (!ikut(t)) {
      console.log(t.padEnd(26) + kini.padStart(10) + '—'.padStart(11) + '   dilewati (tidak ikut tercadang, tidak disentuh)');
      continue;
    }
    const berkas = isi.data[t].length;
    const tanda = kini !== 'rusak' && berkas < Number(kini) ? '   <- berkas lebih sedikit' : '';
    console.log(t.padEnd(26) + kini.padStart(10) + String(berkas).padStart(11) + tanda);
  }

  if (!jalankan) {
    console.log('\nTidak ada yang diubah. Tambahkan --jalankan untuk benar-benar menimpa database dengan isi berkas ini.');
    return;
  }

  console.log('\nMembuat cadangan keadaan sekarang dulu...');
  const aman = await buatCadangan('sebelum-pulih');
  console.log(`  tersimpan: cadangan/${aman.nama}  (pakai berkas ini untuk membatalkan pemulihan)`);

  console.log('Menimpa database...');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
    for (const t of [...TABEL].reverse()) if (ikut(t)) await (tx as any)[t].deleteMany({});
    for (const t of TABEL) {
      if (!ikut(t)) continue;
      const rows = isi.data[t];
      if (rows.length) await (tx as any)[t].createMany({ data: rows });
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
  }, { timeout: 300000, maxWait: 20000 });

  // Pemulihan ini disengaja -- jadikan keadaan hasil pulih sebagai pembanding
  // baru, supaya alarm "database mundur" tidak menyala karenanya.
  await terimaKeadaanSekarang();
  console.log('Selesai. Database HPP sekarang berisi data dari berkas tersebut.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Gagal:', err); process.exit(1); });
