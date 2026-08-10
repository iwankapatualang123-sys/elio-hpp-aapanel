// Laporan: produk & kondimen mana yang DILEWATI saat refresh HPP, dan bahan
// apa penyebabnya.
//
// Alasannya dibuat: `npm run refresh-harga-sekarang` cuma mencetak jumlah
// ("produkDilewati: 10") tanpa menyebut yang mana atau kenapa -- dan angka itu
// mencampur produk yang memang belum diisi resepnya (wajar) dengan produk yang
// resepnya ada tapi bahannya bermasalah (perlu ditindaklanjuti). Tanpa rincian,
// HPP yang diam-diam tidak pernah dihitung ulang gampang terlewat berbulan-bulan.
//
// Script ini HANYA MEMBACA, tidak pernah menulis apa pun ke database.
//
// PENTING: aturan pencarian bahan di bawah harus tetap sama dengan cariBahan()
// di src/jobs/refreshHarga.ts. Kalau logika di sana berubah, ubah juga di sini
// -- kalau tidak, laporan ini akan bohong (bilang aman padahal dilewati).
import { prisma } from '../src/db/prisma';
import { getHargaAcuanMaterial } from '../src/lib/hargaAcuanClient';

type Alasan = string;

async function main() {
  const { rows: acuanRows, available: acuanTersedia } = await getHargaAcuanMaterial();
  console.log(
    acuanTersedia
      ? `Harga acuan (Cashflow): TERSEDIA — ${acuanRows.length} bahan terbaca.`
      : 'Harga acuan (Cashflow): TIDAK TERSEDIA — refresh otomatis akan melewati SEMUA produk & kondimen siklus ini.'
  );

  const acuanSet = new Set(acuanRows.map((r) => r.namaNormal));
  const konversiRows = await prisma.materialKonversi.findMany();
  const konversiSet = new Set(konversiRows.map((r) => r.namaNormal));
  const manualRows = await prisma.materialManual.findMany();
  const manualSet = new Set(manualRows.map((r) => r.nama.toLowerCase().trim()));
  const kondimenAktif = await prisma.kondimen.findMany({ where: { isDeleted: false } });
  const kondimenIdSet = new Set(kondimenAktif.map((k) => k.id));

  // Cerminan cariBahan() di refreshHarga.ts, tapi mengembalikan ALASAN kenapa
  // gagal, bukan cuma null.
  function periksaBahan(namaNormal: string): Alasan | null {
    if (namaNormal.startsWith('kondimen:')) {
      const kid = namaNormal.slice('kondimen:'.length);
      return kondimenIdSet.has(kid) ? null : 'kondimen yang dipakai sudah dihapus';
    }
    if (acuanSet.has(namaNormal)) {
      return konversiSet.has(namaNormal) ? null : 'isi per kemasan belum diisi (Lengkapi satuan)';
    }
    if (manualSet.has(namaNormal)) return null;
    if (konversiSet.has(namaNormal)) {
      return 'satuannya sudah diatur, tapi bahannya tidak ada lagi di data belanja Cashflow';
    }
    return 'tidak ada di katalog mana pun (acuan / manual / kondimen)';
  }

  // ---------------- Produk ----------------
  const produkList = await prisma.produk.findMany({ where: { isDeleted: false, jenis: 'fnb' } });
  const tanpaResep: string[] = [];
  const bermasalah: { nama: string; sebab: { bahan: string; alasan: Alasan }[] }[] = [];
  let siap = 0;

  for (const p of produkList) {
    const reseps = await prisma.resepBahan.findMany({ where: { produkId: p.id } });
    if (!reseps.length) {
      tanpaResep.push(p.nama);
      continue;
    }
    const sebab: { bahan: string; alasan: Alasan }[] = [];
    for (const r of reseps) {
      // hargaOverride = harga per satuan dikunci manual -> bahan tidak perlu
      // dicari sama sekali, sama seperti di refreshHarga.ts.
      if (r.hargaOverride !== null && r.hargaOverride !== undefined) continue;
      const alasan = periksaBahan(r.bahanNamaNormal);
      if (alasan) sebab.push({ bahan: r.bahanNamaNormal, alasan });
    }
    if (sebab.length) bermasalah.push({ nama: p.nama, sebab });
    else siap++;
  }

  console.log(`\nPRODUK aktif: ${produkList.length}`);
  console.log(`  siap dihitung ulang : ${siap}`);
  console.log(`  belum ada resep     : ${tanpaResep.length}${tanpaResep.length ? ' — ' + tanpaResep.join(', ') : ''}`);
  console.log(`  bahan bermasalah    : ${bermasalah.length}`);
  for (const b of bermasalah) {
    console.log(`    • ${b.nama}`);
    for (const s of b.sebab) console.log(`        - ${s.bahan}: ${s.alasan}`);
  }

  // ---------------- Kondimen ----------------
  const kondimenBermasalah: { nama: string; sebab: { bahan: string; alasan: Alasan }[] }[] = [];
  const kondimenKosong: string[] = [];
  let kondimenSiap = 0;

  for (const k of kondimenAktif) {
    const bahanRows = await prisma.kondimenBahan.findMany({ where: { kondimenId: k.id } });
    if (!bahanRows.length) {
      kondimenKosong.push(k.nama);
      continue;
    }
    const sebab: { bahan: string; alasan: Alasan }[] = [];
    for (const b of bahanRows) {
      if (b.hargaOverride !== null && b.hargaOverride !== undefined) continue;
      const alasan = periksaBahan(b.bahanNamaNormal);
      if (alasan) sebab.push({ bahan: b.bahanNamaNormal, alasan });
    }
    if (sebab.length) kondimenBermasalah.push({ nama: k.nama, sebab });
    else kondimenSiap++;
  }

  console.log(`\nKONDIMEN aktif: ${kondimenAktif.length}`);
  console.log(`  siap dihitung ulang : ${kondimenSiap}`);
  console.log(`  belum ada bahan     : ${kondimenKosong.length}${kondimenKosong.length ? ' — ' + kondimenKosong.join(', ') : ''}`);
  console.log(`  bahan bermasalah    : ${kondimenBermasalah.length}`);
  for (const b of kondimenBermasalah) {
    console.log(`    • ${b.nama}`);
    for (const s of b.sebab) console.log(`        - ${s.bahan}: ${s.alasan}`);
  }

  console.log('\nSelesai. Tidak ada data yang diubah.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Gagal:', err);
    process.exit(1);
  });
