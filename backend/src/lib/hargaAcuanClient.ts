import { Pool } from 'pg';
import { env } from '../config/env';

// Baca lintas-app, read-only: harga_acuan_material bukan tabel milik HPP,
// datanya berasal dari pembelian di sisi Cashier/Cashflow (lihat
// BACA-INI.md lama: "gabungan belanja gudang + belanja harian").
//
// FASE 1 (sekarang): connection string di HARGA_ACUAN_DATABASE_URL mengarah
// ke project Supabase Elio Cashier asli (pooler/transaction-mode, role
// read-only khusus tabel ini) — TIDAK menunggu migrasi Cashflow selesai.
// FASE 2 (nanti, setelah Cashflow benar-benar live produksi): ganti nilai
// HARGA_ACUAN_DATABASE_URL ke database elio_cashflow di server sendiri.
// Karena target koneksi cuma dibaca dari satu env var di satu modul ini,
// swap itu jadi ganti config, bukan redesign — jangan taruh logika koneksi
// ini di tempat lain.
//
// Kalau koneksi gagal (mis. project Supabase lama nonaktif, atau server
// elio_cashflow sedang restart), endpoint yang memanggil getHargaAcuan()
// HARUS tetap jalan dengan array kosong + flag `available:false` — bukan
// melempar error yang menjatuhkan seluruh halaman produk. Baris resep
// bersumber "acuan" ditandai "harga referensi tidak tersedia" di frontend,
// bahan manual/kondimen tetap bisa diedit seperti biasa.

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
      // Supabase pooler (dan kemungkinan besar elio_cashflow di Fase 2 juga)
      // pakai sertifikat yang tidak selalu ada di trust store default Node —
      // pola umum untuk koneksi pg ke Supabase, bukan kelonggaran khusus di
      // sini.
      ssl: { rejectUnauthorized: false },
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
