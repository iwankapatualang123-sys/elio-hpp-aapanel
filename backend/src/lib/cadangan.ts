import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { prisma } from '../db/prisma';

// Cadangan data HPP milik aplikasi sendiri + alarm "database mundur".
//
// Kenapa ada: 15 Sep 2026 server crash (dipicu aplikasi warehouse) dan saat
// pemulihan MariaDB dikembalikan ke salinan ~18 Agustus. Absensi selamat karena
// punya backup sendiri; HPP tidak punya, dan backup aaPanel-nya cuma menyimpan
// 3 hari di server yang sama. Data 19 Agu - 14 Sep hilang, dan TIDAK ADA YANG
// SADAR selama seminggu. Modul ini menutup kedua lubang itu:
//   1. cadangan harian berformat JSON di folder ini (BUKAN di folder data
//      MariaDB), disimpan 30 hari, bisa diunduh dari aplikasi supaya ada
//      salinan di luar server;
//   2. alarm kalau isi database tiba-tiba "mundur ke masa lalu".
//
// Dasar alarmnya: aplikasi TIDAK PERNAH menghapus baris produk, kondimen, atau
// log -- hapus produk/kondimen cuma set is_deleted, dan log cuma ditambah. Jadi
// jumlah baris ketiganya & waktu log terakhir tidak mungkin turun secara wajar.
// Kalau turun, database pasti diganti isinya (restore salinan lama, dsb).
// Pembandingnya disimpan di penanda.json, di luar database -- supaya ikut
// selamat kalau database-nya yang dikembalikan.

export const FOLDER = process.env.CADANGAN_DIR || path.resolve(__dirname, '..', '..', 'cadangan');
const FILE_PENANDA = () => path.join(FOLDER, 'penanda.json');
const SIMPAN_HARI = 30;
const SIMPAN_MINIMAL = 7; // berapa pun umurnya, 7 cadangan terbaru selalu disimpan
const POLA_NAMA = /^hpp-\d{8}-\d{6}(-MUNDUR)?\.json\.gz$/;

// Urutan induk -> anak. Dipakai apa adanya oleh skrip pemulihan.
export const TABEL = [
  'cabangHpp', 'kategoriProduk', 'materialManual', 'materialKonversi',
  'kondimen', 'kondimenBahan', 'produk', 'produkFoto', 'resepBahan',
  'biayaOperasionalProduk', 'produkHppHistory', 'produkLog'
] as const;

export interface Keadaan {
  waktu: string;
  produk: number;
  kondimen: number;
  logJumlah: number;
  logTerakhir: string | null;
}

export async function ambilKeadaan(): Promise<Keadaan> {
  const [produk, kondimen, logJumlah, logTerakhir] = await Promise.all([
    prisma.produk.count(),
    prisma.kondimen.count(),
    prisma.produkLog.count(),
    prisma.produkLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  ]);
  return { waktu: new Date().toISOString(), produk, kondimen, logJumlah, logTerakhir: logTerakhir ? logTerakhir.createdAt.toISOString() : null };
}

function bacaPenanda(): Keadaan | null {
  try { return JSON.parse(fs.readFileSync(FILE_PENANDA(), 'utf8')); } catch { return null; }
}
function tulisPenanda(k: Keadaan) {
  fs.mkdirSync(FOLDER, { recursive: true });
  fs.writeFileSync(FILE_PENANDA(), JSON.stringify(k, null, 2));
}

export async function cekMundur() {
  const penanda = bacaPenanda();
  const sekarang = await ambilKeadaan();
  const alasan: string[] = [];
  if (penanda) {
    if (sekarang.produk < penanda.produk) alasan.push(`Jumlah produk turun dari ${penanda.produk} ke ${sekarang.produk}.`);
    if (sekarang.kondimen < penanda.kondimen) alasan.push(`Jumlah kondimen turun dari ${penanda.kondimen} ke ${sekarang.kondimen}.`);
    if (sekarang.logJumlah < penanda.logJumlah) alasan.push(`Log perubahan berkurang dari ${penanda.logJumlah} ke ${sekarang.logJumlah} baris.`);
    if (penanda.logTerakhir && (!sekarang.logTerakhir || sekarang.logTerakhir < penanda.logTerakhir)) {
      alasan.push(`Catatan log terakhir mundur dari ${penanda.logTerakhir.slice(0, 16).replace('T', ' ')} ke ${sekarang.logTerakhir ? sekarang.logTerakhir.slice(0, 16).replace('T', ' ') : 'kosong'} (UTC).`);
    }
  }
  return { mundur: alasan.length > 0, alasan, penanda, sekarang };
}

export function daftarCadangan() {
  if (!fs.existsSync(FOLDER)) return [];
  return fs.readdirSync(FOLDER)
    .filter((n) => POLA_NAMA.test(n))
    .map((n) => {
      const st = fs.statSync(path.join(FOLDER, n));
      return { nama: n, ukuran: st.size, waktu: st.mtime.toISOString(), mundur: n.includes('-MUNDUR') };
    })
    .sort((a, b) => b.waktu.localeCompare(a.waktu));
}

// Mengembalikan path berkas cadangan yang SAH saja -- nama divalidasi ketat
// supaya endpoint unduh tidak bisa dipakai membaca berkas lain di server.
export function pathCadangan(nama: string): string | null {
  if (!POLA_NAMA.test(nama)) return null;
  const p = path.join(FOLDER, nama);
  return fs.existsSync(p) ? p : null;
}

function cap(d: Date) {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

export async function buatCadangan(sumber: 'jadwal' | 'manual' | 'awal' | 'sebelum-pulih') {
  fs.mkdirSync(FOLDER, { recursive: true });
  const status = await cekMundur();
  const data: Record<string, unknown[]> = {};
  const jumlah: Record<string, number> = {};
  const gagal: Record<string, string> = {};
  for (const t of TABEL) {
    try {
      const rows: unknown[] = await (prisma as any)[t].findMany();
      data[t] = rows;
      jumlah[t] = rows.length;
    } catch (err) {
      // Satu tabel rusak TIDAK boleh menggagalkan seluruh cadangan -- justru saat
      // server bermasalah cadangan paling dibutuhkan. Ditemukan nyata: sesudah
      // crash 15 Sep, produk_foto jadi "doesn't exist in engine" (MySQL 1932)
      // dan membuat cadangan pertama gagal total. Tabel yang gagal dicatat di
      // `gagal` dan TIDAK ada di `data`, supaya skrip pemulihan tahu untuk
      // tidak menyentuhnya (bukan mengosongkannya).
      gagal[t] = pesanSingkat(err);
    }
  }
  const isi = JSON.stringify({ versi: 1, aplikasi: 'elio-hpp', dibuat: new Date().toISOString(), sumber, mundur: status.mundur, jumlah, gagal, data });
  const nama = `hpp-${cap(new Date())}${status.mundur ? '-MUNDUR' : ''}.json.gz`;
  const buf = zlib.gzipSync(isi);
  fs.writeFileSync(path.join(FOLDER, nama), buf);

  // Saat database terdeteksi mundur: JANGAN geser penanda (alarm harus tetap
  // menyala sampai ada manusia yang memutuskan) dan JANGAN hapus cadangan lama
  // -- justru cadangan lama itulah satu-satunya salinan data yang benar.
  if (!status.mundur) {
    tulisPenanda(status.sekarang);
    bersihkanLama();
  }
  return { nama, ukuran: buf.length, jumlah, gagal, mundur: status.mundur, alasan: status.alasan };
}

function pesanSingkat(err: unknown): string {
  const teks = String((err as any)?.message || err);
  const m = teks.match(/message: "([^"]+)"/);
  return (m ? m[1] : teks.trim().split('\n').pop() || teks).slice(0, 200);
}

// Nama tabel di database untuk ditampilkan ke user (produkFoto -> produk_foto).
const namaTabel = (model: string) => model.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

// Tabel yang tidak bisa dibaca sama sekali -- tidak ikut tercadang dan fiturnya
// di aplikasi ikut rusak. Cek murah (COUNT), dipanggil tiap aplikasi dimuat.
export async function cekTabelRusak() {
  const hasil = await Promise.all(TABEL.map(async (t) => {
    try { await (prisma as any)[t].count(); return null; }
    catch (err) { return { tabel: namaTabel(t), pesan: pesanSingkat(err) }; }
  }));
  return hasil.filter((x): x is { tabel: string; pesan: string } => x !== null);
}

function bersihkanLama() {
  const batas = Date.now() - SIMPAN_HARI * 86400000;
  daftarCadangan().slice(SIMPAN_MINIMAL).forEach((c) => {
    if (new Date(c.waktu).getTime() < batas) {
      try { fs.unlinkSync(path.join(FOLDER, c.nama)); } catch { /* biarkan, dicoba lagi besok */ }
    }
  });
}

// Dipakai setelah user SENGAJA menerima keadaan database sekarang (mis. sesudah
// memulihkan cadangan lama dengan sadar) -- mematikan alarm dengan menjadikan
// keadaan sekarang sebagai pembanding baru.
export async function terimaKeadaanSekarang() {
  const k = await ambilKeadaan();
  tulisPenanda(k);
  return k;
}

export async function statusCadangan() {
  const [s, tabelRusak] = await Promise.all([cekMundur(), cekTabelRusak()]);
  const daftar = daftarCadangan();
  const terakhir = daftar[0] || null;
  const umurJam = terakhir ? (Date.now() - new Date(terakhir.waktu).getTime()) / 3600000 : null;
  return {
    mundur: s.mundur,
    alasan: s.alasan,
    penanda: s.penanda,
    sekarang: s.sekarang,
    cadanganTerakhir: terakhir,
    // lebih dari 36 jam tanpa cadangan = jadwal hariannya tidak jalan
    basi: umurJam === null || umurJam > 36,
    tabelRusak,
    jumlahCadangan: daftar.length
  };
}
