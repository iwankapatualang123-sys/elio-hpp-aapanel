import { prisma } from '../db/prisma';

// Pencarian pengaturan HPP (margin, overhead, biaya operasional) untuk sebuah
// produk, berdasarkan cabang & kategorinya. Lihat catatan di
// prisma/schema.prisma model PengaturanHpp untuk alasan pindah dari per-produk.
//
// Urutan pencarian -- yang paling khusus menang:
//   1. kategori produk itu sendiri  : (cabang ini + kategori), lalu (semua cabang + kategori)
//   2. naik ke kategori induknya    : sama, diulang sampai kategori teratas
//   3. (cabang ini + semua kategori)
//   4. (semua cabang + semua kategori)  <- "Umum"
//   5. bawaan kode, kalau tabelnya masih kosong
// Jadi "Nasi Goreng Series" otomatis ikut "Makanan" kalau tidak diatur sendiri,
// dan di tiap tingkat kategori, pengaturan khusus cabang menang atas yang umum.

export interface BiayaItem {
  label: string;
  mode: string; // 'manual' (nominal rupiah) | 'persen' (% dari biaya material)
  value: number;
  aktif: boolean;
}

export interface BarisPengaturan {
  id: string;
  cabangHppId: string | null;
  kategoriId: string | null;
  marginPersen: number;
  overheadPersen: number;
  overheadAktif: boolean;
  biaya: BiayaItem[];
}

export interface HasilCari {
  marginPersen: number;
  overheadPersen: number;
  overheadAktif: boolean;
  biaya: BiayaItem[];
  dariId: string | null; // baris pengaturan yang dipakai (null = bawaan kode)
}

// Dipakai kalau tabel pengaturan masih kosong -- sama dengan @default lama di
// kolom produk, supaya aplikasi yang belum sempat diisi tetap berhitung wajar.
export const BAWAAN: HasilCari = { marginPersen: 60, overheadPersen: 15, overheadAktif: true, biaya: [], dariId: null };

export interface Konteks {
  baris: BarisPengaturan[];
  indukKategori: Map<string, string | null>;
}

export async function muatKonteks(): Promise<Konteks> {
  const [rows, kategori] = await Promise.all([
    prisma.pengaturanHpp.findMany({ include: { biaya: true } }),
    prisma.kategoriProduk.findMany({ select: { id: true, parentId: true } })
  ]);
  return {
    baris: rows.map((r) => ({
      id: r.id,
      cabangHppId: r.cabangHppId,
      kategoriId: r.kategoriId,
      marginPersen: Number(r.marginPersen),
      overheadPersen: Number(r.overheadPersen),
      overheadAktif: r.overheadAktif,
      biaya: r.biaya.map((b) => ({ label: b.label, mode: b.mode, value: Number(b.value), aktif: b.aktif }))
    })),
    indukKategori: new Map(kategori.map((k) => [k.id, k.parentId]))
  };
}

function ambil(k: Konteks, cabangId: string | null, kategoriId: string | null): HasilCari | null {
  const r = k.baris.find((x) => x.cabangHppId === cabangId && x.kategoriId === kategoriId);
  return r ? { marginPersen: r.marginPersen, overheadPersen: r.overheadPersen, overheadAktif: r.overheadAktif, biaya: r.biaya, dariId: r.id } : null;
}

export function cariPengaturan(k: Konteks, cabangId: string | null, kategoriId: string | null): HasilCari {
  // Rantai kategori dari yang paling khusus ke akar. Batas 10 tingkat supaya
  // data kategori yang (entah bagaimana) melingkar tidak bikin loop abadi.
  const rantai: string[] = [];
  let kat = kategoriId;
  for (let i = 0; kat && i < 10; i++) {
    rantai.push(kat);
    kat = k.indukKategori.get(kat) ?? null;
  }
  for (const id of rantai) {
    const khusus = cabangId ? ambil(k, cabangId, id) : null;
    if (khusus) return khusus;
    const semuaCabang = ambil(k, null, id);
    if (semuaCabang) return semuaCabang;
  }
  const perCabang = cabangId ? ambil(k, cabangId, null) : null;
  if (perCabang) return perCabang;
  return ambil(k, null, null) || BAWAAN;
}

// Saklar mati = tidak ikut dihitung ke HPP, tapi angkanya tetap tersimpan,
// supaya user bisa melihat COGS murni bahan lalu menyalakannya lagi tanpa
// mengetik ulang. Berlaku untuk overhead maupun tiap jenis biaya di bawah.
export function hitungOverhead(dasar: number, atur: { overheadPersen: number; overheadAktif: boolean }): number {
  return atur.overheadAktif ? (atur.overheadPersen / 100) * dasar : 0;
}

// Total biaya operasional yang IKUT dihitung (jenis yang saklarnya mati dilewati).
export function hitungBiaya(material: number, biaya: BiayaItem[]): number {
  return biaya.reduce((t, b) => {
    if (!b.aktif) return t;
    return t + (b.mode === 'persen' ? (b.value / 100) * material : b.value);
  }, 0);
}
