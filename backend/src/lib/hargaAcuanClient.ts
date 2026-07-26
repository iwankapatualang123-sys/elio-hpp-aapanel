import { Pool } from 'pg';
import { env } from '../config/env';

// Baca lintas-app, read-only: harga_acuan_material bukan tabel milik HPP,
// datanya berasal dari pembelian di sisi Cashier/Cashflow (lihat
// BACA-INI.md lama: "gabungan belanja gudang + belanja harian").
//
// HARGA_ACUAN_DATABASE_URL mengarah ke database `elio_cashflow` (PostgreSQL)
// di server aaPanel yang SAMA — koneksi lokal (127.0.0.1), bukan ke Supabase
// sama sekali. Cashflow sudah live produksi sungguhan ~1 bulan (dikonfirmasi
// user 2026-07-26), jadi elio_cashflow lebih update untuk data pembelian
// dibanding Supabase lama. `harga_acuan_material` di sana adalah VIEW
// (dikonfirmasi via psql, bukan tabel biasa) — query di bawah cuma perlu
// SELECT dari view itu, agregasi belanja gudang+harian sudah dikerjakan
// oleh definisi view-nya sendiri, tidak perlu dihitung ulang di sini.
// Role Postgres yang dipakai HANYA di-GRANT SELECT ke view ini (bukan akses
// skema penuh) — lihat instruksi GRANT di STATUS_MIGRASI.md.
//
// Kalau koneksi gagal (mis. Postgres server restart), endpoint yang
// memanggil getHargaAcuanMaterial() HARUS tetap jalan dengan array kosong +
// flag `available:false` — bukan melempar error yang menjatuhkan seluruh
// halaman produk. Baris resep bersumber "acuan" ditandai "harga referensi
// tidak tersedia" di frontend, bahan manual/kondimen tetap bisa diedit
// seperti biasa.

export interface HargaAcuanRow {
  namaKanonik: string | null;
  namaAsli: string | null;
  namaNormal: string;
  hargaPerUnitBeli: number;
  sumber: string | null;
  tanggalTerakhir: string | null;
}

const CACHE_TTL_MS = 45_000;

let pool: Pool | null = null;
let cache: { rows: HargaAcuanRow[]; expiresAt: number } | null = null;

function getPool(): Pool | null {
  if (!env.hargaAcuanDatabaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: env.hargaAcuanDatabaseUrl,
      // Koneksi lokal (127.0.0.1) ke Postgres di server yang sama — tidak
      // pakai SSL, beda dari kalau ini masih nyambung ke Supabase.
      ssl: false,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000
    });
    pool.on('error', (err) => {
      // Error di koneksi idle (mis. server lain restart) — jangan sampai
      // menjatuhkan proses backend HPP secara keseluruhan.
      console.error('[hargaAcuanClient] pool error (non-fatal):', err.message);
    });
  }
  return pool;
}

export async function getHargaAcuanMaterial(): Promise<{ rows: HargaAcuanRow[]; available: boolean }> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return { rows: cache.rows, available: true };
  }

  const p = getPool();
  if (!p) {
    // HARGA_ACUAN_DATABASE_URL belum diisi (mis. dev lokal) — degradasi
    // senyap, bukan error, supaya bagian lain aplikasi tetap bisa diuji.
    return { rows: cache?.rows ?? [], available: false };
  }

  try {
    const result = await p.query<{
      nama_kanonik: string | null;
      nama_asli: string | null;
      nama_normal: string;
      harga_per_unit_beli: string | null;
      sumber: string | null;
      tanggal_terakhir: string | null;
    }>('SELECT nama_kanonik, nama_asli, nama_normal, harga_per_unit_beli, sumber, tanggal_terakhir FROM harga_acuan_material');

    const rows: HargaAcuanRow[] = result.rows.map((r) => ({
      namaKanonik: r.nama_kanonik,
      namaAsli: r.nama_asli,
      namaNormal: r.nama_normal,
      hargaPerUnitBeli: Number(r.harga_per_unit_beli) || 0,
      sumber: r.sumber,
      tanggalTerakhir: r.tanggal_terakhir
    }));

    cache = { rows, expiresAt: now + CACHE_TTL_MS };
    return { rows, available: true };
  } catch (err: any) {
    console.error('[hargaAcuanClient] query gagal, pakai cache lama / kosong:', err.message);
    // Sengaja kembalikan cache basi (kalau ada) daripada array kosong saat
    // ada cache — lebih berguna bagi staff daripada tiba-tiba semua harga
    // acuan hilang karena gangguan singkat di sisi lain.
    return { rows: cache?.rows ?? [], available: false };
  }
}
