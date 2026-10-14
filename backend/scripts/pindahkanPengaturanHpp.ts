// Pindahkan margin, overhead & biaya operasional dari TIAP PRODUK menjadi
// pengaturan per cabang/kategori (tabel pengaturan_hpp).
//
// BAWAANNYA CUMA MENAMPILKAN RENCANA, tidak menulis apa pun. Tambah --jalankan
// untuk benar-benar memindahkan.
//
// Caranya: produk dikelompokkan per (cabang, kategori), lalu dilihat angka
// margin/overhead tiap kelompok. Kombinasi yang dipakai paling banyak jadi
// pengaturan "Umum"; kelompok yang berbeda dari itu dapat barisnya sendiri.
// Hasilnya setiap produk tetap mendapat angka yang PERSIS SAMA seperti
// sebelum pemindahan -- tidak ada HPP yang bergeser.
//
// Kelompok yang di dalamnya angkanya campur TIDAK dipindahkan otomatis; skrip
// berhenti dan menyebutkan yang mana, supaya user yang memutuskan.
import crypto from 'crypto';
import { prisma } from '../src/db/prisma';
import { terapkanPengaturan } from '../src/jobs/refreshHarga';

const kunci = (c: string | null, k: string | null) => `${c || ''}|${k || ''}`;

async function main() {
  const jalankan = process.argv.includes('--jalankan');

  const sudahAda = await prisma.pengaturanHpp.count();
  if (sudahAda > 0) {
    console.error(`Tabel pengaturan sudah berisi ${sudahAda} baris. Skrip ini hanya untuk pemindahan pertama kali.`);
    process.exit(1);
  }

  const produk = await prisma.produk.findMany({
    where: { isDeleted: false },
    select: { id: true, nama: true, cabangHppId: true, kategoriId: true, overheadPersen: true, targetMarginPersen: true }
  });
  const cabang = new Map((await prisma.cabangHpp.findMany()).map((c) => [c.id, c.nama]));
  const kategori = new Map((await prisma.kategoriProduk.findMany()).map((k) => [k.id, k.nama]));
  const namaKel = (c: string | null, k: string | null) =>
    `${c ? cabang.get(c) || '?' : 'semua cabang'} › ${k ? kategori.get(k) || '?' : 'semua kategori'}`;

  // 1) kelompokkan
  const kelompok = new Map<string, { cabangHppId: string | null; kategoriId: string | null; produk: typeof produk; kombinasi: Set<string> }>();
  for (const p of produk) {
    const kk = kunci(p.cabangHppId, p.kategoriId);
    if (!kelompok.has(kk)) kelompok.set(kk, { cabangHppId: p.cabangHppId, kategoriId: p.kategoriId, produk: [], kombinasi: new Set() });
    const g = kelompok.get(kk)!;
    g.produk.push(p);
    g.kombinasi.add(`${Number(p.targetMarginPersen)}/${Number(p.overheadPersen)}`);
  }

  const campur = [...kelompok.values()].filter((g) => g.kombinasi.size > 1);
  if (campur.length) {
    console.error('Berhenti: ada kelompok yang angkanya masih campur, tidak bisa dipindahkan otomatis.\n');
    campur.forEach((g) => console.error(`  ${namaKel(g.cabangHppId, g.kategoriId)}  ->  ${[...g.kombinasi].join(' dan ')}  (${g.produk.length} produk)`));
    console.error('\nSeragamkan dulu produk di kelompok itu, lalu jalankan skrip ini lagi.');
    process.exit(1);
  }

  // 2) kombinasi terbanyak jadi "Umum"
  const hitung = new Map<string, number>();
  for (const g of kelompok.values()) {
    const k = [...g.kombinasi][0];
    hitung.set(k, (hitung.get(k) || 0) + g.produk.length);
  }
  const umum = [...hitung.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const [umumMargin, umumOverhead] = umum.split('/').map(Number);

  // 3) biaya operasional per produk -> ikut kelompoknya, hanya kalau SEMUA
  // produk di kelompok itu punya daftar biaya yang sama persis. Kalau beda,
  // memindahkannya akan mengubah HPP produk lain di kelompok yang sama.
  const biayaProduk = await prisma.biayaOperasionalProduk.findMany();
  const biayaPer = new Map<string, { label: string; mode: string; value: number }[]>();
  biayaProduk.forEach((b) => {
    const arr = biayaPer.get(b.produkId) || [];
    arr.push({ label: b.label, mode: b.mode, value: Number(b.value) });
    biayaPer.set(b.produkId, arr);
  });
  const sidik = (l: { label: string; mode: string; value: number }[] | undefined) =>
    (l || []).map((x) => `${x.label}|${x.mode}|${x.value}`).sort().join(';');

  const rencana: { cabangHppId: string | null; kategoriId: string | null; margin: number; overhead: number; biaya: { label: string; mode: string; value: number }[]; jumlahProduk: number }[] = [];
  const biayaTidakIkut: string[] = [];

  for (const g of kelompok.values()) {
    const [margin, overhead] = [...g.kombinasi][0].split('/').map(Number);
    const sidikSemua = new Set(g.produk.map((p) => sidik(biayaPer.get(p.id))));
    let biaya: { label: string; mode: string; value: number }[] = [];
    if (sidikSemua.size === 1 && [...sidikSemua][0] !== '') {
      biaya = biayaPer.get(g.produk[0].id) || [];
    } else if (sidikSemua.size > 1) {
      g.produk.filter((p) => biayaPer.get(p.id)).forEach((p) => biayaTidakIkut.push(`${p.nama} (${namaKel(g.cabangHppId, g.kategoriId)})`));
    }
    const berbedaDariUmum = margin !== umumMargin || overhead !== umumOverhead;
    if (berbedaDariUmum || biaya.length) {
      rencana.push({ cabangHppId: g.cabangHppId, kategoriId: g.kategoriId, margin, overhead, biaya, jumlahProduk: g.produk.length });
    }
  }

  console.log(`Produk aktif: ${produk.length}\n`);
  console.log('Pengaturan yang akan dibuat:');
  console.log(`  Umum (semua cabang, semua kategori)        margin ${umumMargin}%  overhead ${umumOverhead}%`);
  rencana.forEach((r) => {
    const b = r.biaya.length ? '  biaya: ' + r.biaya.map((x) => `${x.label} ${x.mode === 'persen' ? x.value + '%' : 'Rp ' + x.value}`).join(', ') : '';
    console.log(`  ${namaKel(r.cabangHppId, r.kategoriId).padEnd(42)} margin ${r.margin}%  overhead ${r.overhead}%${b}   (${r.jumlahProduk} produk)`);
  });
  if (biayaTidakIkut.length) {
    console.log('\nBiaya operasional TIDAK ikut dipindahkan (kelompoknya tidak seragam):');
    biayaTidakIkut.forEach((x) => console.log('  - ' + x));
  }
  console.log(`\nBaris biaya operasional per produk yang akan dihapus setelah dipindah: ${biayaProduk.length}`);

  if (!jalankan) {
    console.log('\nTidak ada yang diubah. Tambahkan --jalankan untuk memindahkan.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.pengaturanHpp.create({ data: { id: crypto.randomUUID(), cabangHppId: null, kategoriId: null, marginPersen: umumMargin, overheadPersen: umumOverhead } });
    for (const r of rencana) {
      await tx.pengaturanHpp.create({
        data: {
          id: crypto.randomUUID(),
          cabangHppId: r.cabangHppId,
          kategoriId: r.kategoriId,
          marginPersen: r.margin,
          overheadPersen: r.overhead,
          biaya: { create: r.biaya.map((x) => ({ id: crypto.randomUUID(), label: x.label, mode: x.mode, value: x.value, aktif: true })) }
        }
      });
    }
    // Baris per produk dihapus supaya tidak ada dua sumber yang bisa berbeda.
    // Isinya sudah pindah ke pengaturan kelompoknya di atas.
    await tx.biayaOperasionalProduk.deleteMany({});
  });

  console.log('\nPengaturan dibuat. Menghitung ulang semua produk untuk memastikan tidak ada yang bergeser...');
  const hasil = await terapkanPengaturan('pemindahan pengaturan');
  console.log(`  kebijakan berubah : ${hasil.kebijakanBerubah} produk  (idealnya 0)`);
  console.log(`  HPP berubah       : ${hasil.produkBerubah} produk  (idealnya 0, kecuali yang biayanya memang dilepas)`);
  console.log(`  dilewati          : ${hasil.produkDilewati} produk (resep belum lengkap)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Gagal:', err); process.exit(1); });
