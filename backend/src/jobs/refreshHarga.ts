import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { getHargaAcuanMaterial } from '../lib/hargaAcuanClient';

// Versi server dari updateSemuaHarga() di app.js (tombol "Update Harga" manual)
// -- dipakai oleh scheduler (server.ts) untuk refresh HPP otomatis tanpa staff
// perlu buka aplikasi. Sengaja implementasi TERPISAH dari app.js (bukan
// dipanggil lewat HTTP dari sana), karena job ini harus tetap jalan walau
// tidak ada satu pun browser yang membuka aplikasi.
//
// TIDAK PERNAH menyentuh hargaJualAktual (harga jual sungguhan di outlet,
// diisi manual staff) -- cuma hppTerakhir & hargaJualDisarankan yang direfresh.

interface HasilRefresh {
  produkBerubah: number;
  produkDilewati: number;
  kondimenBerubah: number;
  kondimenDilewati: number;
  acuanTersedia: boolean;
}

export async function refreshSemuaHarga(): Promise<HasilRefresh> {
  const { rows: acuanRows, available: acuanTersedia } = await getHargaAcuanMaterial();

  if (!acuanTersedia) {
    // Koneksi ke data harga Cashflow lagi bermasalah (bukan sekadar cache
    // basi) -- JANGAN lanjut hitung ulang, bisa2 semua bahan acuan kehitung
    // harga 0 gara2 gangguan sementara. Beda dari tombol manual (ada manusia
    // yang langsung lihat hasilnya), job otomatis ini tidak boleh ambil
    // resiko itu tanpa ada yang mengawasi.
    console.warn('[refreshHarga] harga_acuan_material tidak tersedia, lewati siklus ini.');
    return { produkBerubah: 0, produkDilewati: 0, kondimenBerubah: 0, kondimenDilewati: 0, acuanTersedia: false };
  }

  const acuanMap = new Map<string, number>();
  acuanRows.forEach((r) => acuanMap.set(r.namaNormal, r.hargaPerUnitBeli));

  const konversiRows = await prisma.materialKonversi.findMany();
  const konversiMap = new Map<string, number>();
  konversiRows.forEach((r) => konversiMap.set(r.namaNormal, Number(r.isiPerKemasan)));

  const manualRows = await prisma.materialManual.findMany();
  const manualMap = new Map<string, number>();
  manualRows.forEach((r) => manualMap.set(r.nama.toLowerCase().trim(), Number(r.hargaPerSatuan)));

  const kondimenHargaMap = new Map<string, number>(); // kondimenId -> hpp per satuan terkini

  function cariBahan(namaNormal: string): { harga: number; konvIsi: number | null } | null {
    if (namaNormal.startsWith('kondimen:')) {
      const kid = namaNormal.slice('kondimen:'.length);
      const harga = kondimenHargaMap.get(kid);
      return harga !== undefined ? { harga, konvIsi: 1 } : null;
    }
    if (acuanMap.has(namaNormal)) {
      return { harga: acuanMap.get(namaNormal) as number, konvIsi: konversiMap.get(namaNormal) ?? null };
    }
    if (manualMap.has(namaNormal)) {
      return { harga: manualMap.get(namaNormal) as number, konvIsi: 1 };
    }
    return null;
  }

  // 1) Kondimen dulu -- HPP produk yang pakai kondimen (★) bergantung ke nilai ini
  const kondimenList = await prisma.kondimen.findMany({ where: { isDeleted: false } });
  let kondimenBerubah = 0;
  let kondimenDilewati = 0;
  for (const k of kondimenList) {
    kondimenHargaMap.set(k.id, Number(k.hppPerSatuan)); // default: nilai lama, dioverride kalau berhasil dihitung ulang di bawah
    const bahanRows = await prisma.kondimenBahan.findMany({ where: { kondimenId: k.id } });
    if (!bahanRows.length) {
      kondimenDilewati++;
      continue;
    }
    let total = 0;
    let semuaLengkap = true;
    for (const b of bahanRows) {
      const konvIsi = b.isiKemasan !== null && b.isiKemasan !== undefined ? Number(b.isiKemasan) : null;
      if (konvIsi === null) {
        semuaLengkap = false; // satuan belum dilengkapi -- sama seperti updateSemuaHarga(), jangan diam2 anggap isi 1
        break;
      }
      const found = cariBahan(b.bahanNamaNormal);
      const harga = found ? found.harga : 0;
      const override = b.hargaOverride !== null && b.hargaOverride !== undefined ? Number(b.hargaOverride) : null;
      const perUnit = override !== null ? override : harga / (konvIsi || 1);
      total += perUnit * Number(b.qtyPakai || 0);
    }
    if (!semuaLengkap) {
      kondimenDilewati++;
      continue;
    }
    const totalHasil = Number(k.totalHasil) || 1;
    const per = totalHasil > 0 ? total / totalHasil : 0;
    const hppTotal = Math.round(total * 100) / 100;
    const hppPerSatuan = Math.round(per * 100) / 100;
    if (hppTotal !== Number(k.hppTotal) || hppPerSatuan !== Number(k.hppPerSatuan)) {
      await prisma.kondimen.update({ where: { id: k.id }, data: { hppTotal, hppPerSatuan, updatedAt: new Date() } });
      kondimenHargaMap.set(k.id, hppPerSatuan);
      kondimenBerubah++;
    }
  }

  // 2) Produk -- pakai kondimenHargaMap yang sudah direfresh di atas
  const produkList = await prisma.produk.findMany({ where: { isDeleted: false, jenis: 'fnb' } });
  let produkBerubah = 0;
  let produkDilewati = 0;
  for (const p of produkList) {
    const reseps = await prisma.resepBahan.findMany({ where: { produkId: p.id } });
    if (!reseps.length) {
      produkDilewati++;
      continue; // belum diisi, tidak ada yang direfresh
    }

    // Sama seperti kondimen: kalau ada bahan yang belum lengkap konversi satuannya
    // (dan tidak ada hargaOverride), JANGAN hitung pakai harga mentah -- itu yang
    // bikin "lkk minyak wijen" (harga per botol) kepakai seolah harga per-ml, HPP
    // "Nasi Goreng Hongkong" meledak ~118x (912.296 padahal harusnya ~7.677).
    // Lewati seluruh produk itu, jangan diam2 salah hitung.
    const semuaLengkap = reseps.every((r) => {
      if (r.hargaOverride !== null && r.hargaOverride !== undefined) return true;
      const found = cariBahan(r.bahanNamaNormal);
      return !!(found && found.konvIsi !== null);
    });
    if (!semuaLengkap) {
      produkDilewati++;
      continue;
    }

    let material = 0;
    for (const r of reseps) {
      const override = r.hargaOverride !== null && r.hargaOverride !== undefined ? Number(r.hargaOverride) : null;
      if (override !== null) {
        material += override * Number(r.qtyPakai || 0);
        continue;
      }
      const found = cariBahan(r.bahanNamaNormal) as { harga: number; konvIsi: number };
      material += (found.harga / found.konvIsi) * Number(r.qtyPakai || 0);
    }

    const opexRows = await prisma.biayaOperasionalProduk.findMany({ where: { produkId: p.id } });
    let opex = 0;
    for (const o of opexRows) {
      opex += o.mode === 'persen' ? (Number(o.value) / 100) * material : Number(o.value);
    }

    const overheadPersen = Number(p.overheadPersen) || 15;
    const marginPersen = Number(p.targetMarginPersen) || 60;
    const overhead = (overheadPersen / 100) * (material + opex);
    const final = material + opex + overhead;
    const hargaJual = marginPersen < 100 ? final / (1 - marginPersen / 100) : final;

    const hppBaru = Math.round(final);
    const hargaBaru = Math.round(hargaJual);
    const hppLama = Math.round(Number(p.hppTerakhir) || 0);

    if (hppBaru !== hppLama) {
      await prisma.produk.update({
        where: { id: p.id },
        data: { hppTerakhir: hppBaru, hargaJualDisarankan: hargaBaru, updatedAt: new Date() }
      });
      await prisma.produkHppHistory.create({
        data: { id: crypto.randomUUID(), produkId: p.id, hpp: hppBaru, hargaJual: hargaBaru, marginPersen }
      });
      await prisma.produkLog.create({
        data: {
          id: crypto.randomUUID(),
          produkId: p.id,
          produkNama: p.nama,
          aksi: 'update-harga-otomatis',
          detail: `HPP Rp ${hppLama.toLocaleString('id-ID')} → Rp ${hppBaru.toLocaleString('id-ID')} (refresh otomatis harian)`,
          oleh: 'sistem (auto)'
        }
      });
      produkBerubah++;
    }
  }

  return { produkBerubah, produkDilewati, kondimenBerubah, kondimenDilewati, acuanTersedia: true };
}
