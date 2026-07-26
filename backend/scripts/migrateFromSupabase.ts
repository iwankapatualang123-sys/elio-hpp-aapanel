// Migrasi sekali-jalan (idempotent — upsert by id, aman dijalankan ulang)
// dari Supabase project Elio Cashier ke MySQL lokal. Cuma menyalin 11 tabel
// milik HPP sendiri — harga_acuan_material TIDAK disalin, itu dibaca live
// cross-DB (lihat src/lib/hargaAcuanClient.ts).
//
// Perlu SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY di backend/.env (service
// role, BUKAN publishable/anon key, supaya bisa baca semua baris tanpa
// terbentuk RLS). Ambil dari Supabase Dashboard project Elio Cashier ->
// Settings -> API. JANGAN tempel key ini di chat — isi langsung di .env di
// server.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// @supabase/supabase-js v2 butuh WebSocket native (baru ada bawaan di Node
// 22+) begitu createClient() dipanggil, bahkan kalau realtime tidak pernah
// dipakai (lihat SupabaseClient._initRealtimeClient). Server ini masih Node
// 20 -> suplai polyfill dari paket `ws`, sama seperti solusi yang sudah
// dipakai di migrasi Elio Absensi.
import WebSocket from 'ws';
import { prisma } from '../src/db/prisma';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di backend/.env dulu (lihat komentar di atas file ini).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: WebSocket as any }
});

async function fetchAll(table: string): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`Gagal baca ${table}: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function migrateKategoriProduk() {
  const rows = await fetchAll('kategori_produk');
  // Urut level ascending -- parent (level rendah) harus sudah ada dulu
  // sebelum anak di-insert (self-referential FK parent_id). Jangan asumsikan
  // urutan baris dari Supabase sudah aman.
  rows.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  for (const r of rows) {
    const data = { nama: r.nama, parentId: r.parent_id ?? null, level: r.level ?? 1, urutan: r.urutan ?? 0, isDeleted: !!r.is_deleted };
    await prisma.kategoriProduk.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`kategori_produk: ${rows.length} baris`);
}

async function migrateCabangHpp() {
  const rows = await fetchAll('cabang_hpp');
  for (const r of rows) {
    await prisma.cabangHpp.upsert({
      where: { id: r.id },
      create: { id: r.id, nama: r.nama, aktif: r.aktif ?? true, createdAt: r.created_at ? new Date(r.created_at) : new Date() },
      update: { nama: r.nama, aktif: r.aktif ?? true }
    });
  }
  console.log(`cabang_hpp: ${rows.length} baris`);
}

async function migrateMaterialManual() {
  const rows = await fetchAll('material_manual');
  for (const r of rows) {
    const data = { nama: r.nama, hargaPerSatuan: toNum(r.harga_per_satuan) ?? 0, satuan: r.satuan };
    await prisma.materialManual.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`material_manual: ${rows.length} baris`);
}

async function migrateMaterialKonversi() {
  const rows = await fetchAll('material_konversi');
  for (const r of rows) {
    const data = { nama: r.nama, isiPerKemasan: toNum(r.isi_per_kemasan) ?? 1, satuanPakai: r.satuan_pakai };
    await prisma.materialKonversi.upsert({ where: { namaNormal: r.nama_normal }, create: { namaNormal: r.nama_normal, ...data }, update: data });
  }
  console.log(`material_konversi: ${rows.length} baris`);
}

async function migrateKondimen() {
  const rows = await fetchAll('kondimen');
  for (const r of rows) {
    const data = {
      nama: r.nama, satuanHasil: r.satuan_hasil, totalHasil: toNum(r.total_hasil) ?? 1,
      hppTotal: toNum(r.hpp_total) ?? 0, hppPerSatuan: toNum(r.hpp_per_satuan) ?? 0,
      catatan: r.catatan ?? null, isDeleted: !!r.is_deleted
    };
    await prisma.kondimen.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`kondimen: ${rows.length} baris`);
}

async function migrateProduk() {
  const rows = await fetchAll('produk');
  for (const r of rows) {
    const data = {
      nama: r.nama, jenis: r.jenis ?? 'fnb', kategori: r.kategori ?? null,
      kategoriId: r.kategori_id ?? null, cabangHppId: r.cabang_hpp_id ?? null,
      overheadPersen: toNum(r.overhead_persen) ?? 15, targetMarginPersen: toNum(r.target_margin_persen) ?? 60,
      hppTerakhir: toNum(r.hpp_terakhir) ?? 0, hargaJualDisarankan: toNum(r.harga_jual_disarankan) ?? 0,
      caraProses: r.cara_proses ?? null, isDeleted: !!r.is_deleted
    };
    await prisma.produk.upsert({
      where: { id: r.id },
      create: { id: r.id, ...data, createdAt: r.created_at ? new Date(r.created_at) : new Date() },
      update: data
    });
  }
  console.log(`produk: ${rows.length} baris`);
}

async function migrateKondimenBahan() {
  const rows = await fetchAll('kondimen_bahan');
  for (const r of rows) {
    const data = {
      kondimenId: r.kondimen_id, bahanNamaNormal: r.bahan_nama_normal, bahanNama: r.bahan_nama ?? r.bahan_nama_normal,
      sumberBahan: r.sumber_bahan ?? 'acuan', qtyPakai: toNum(r.qty_pakai) ?? 0,
      isiKemasan: toNum(r.isi_kemasan), satuan: r.satuan ?? null, hargaOverride: toNum(r.harga_override)
    };
    await prisma.kondimenBahan.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`kondimen_bahan: ${rows.length} baris`);
}

async function migrateResepBahan() {
  const rows = await fetchAll('resep_bahan');
  for (const r of rows) {
    const data = {
      produkId: r.produk_id, bahanNamaNormal: r.bahan_nama_normal,
      sumberBahan: r.sumber_bahan ?? 'acuan', qtyPakai: toNum(r.qty_pakai) ?? 0, hargaOverride: toNum(r.harga_override)
    };
    await prisma.resepBahan.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`resep_bahan: ${rows.length} baris`);
}

async function migrateBiayaOperasionalProduk() {
  const rows = await fetchAll('biaya_operasional_produk');
  for (const r of rows) {
    const data = { produkId: r.produk_id, label: r.label, mode: r.mode ?? 'manual', value: toNum(r.value) ?? 0 };
    await prisma.biayaOperasionalProduk.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  console.log(`biaya_operasional_produk: ${rows.length} baris`);
}

async function migrateProdukHppHistory() {
  const rows = await fetchAll('produk_hpp_history');
  for (const r of rows) {
    await prisma.produkHppHistory.upsert({
      where: { id: r.id },
      create: {
        id: r.id, produkId: r.produk_id, hpp: toNum(r.hpp) ?? 0,
        hargaJual: toNum(r.harga_jual) ?? 0, marginPersen: toNum(r.margin_persen) ?? 0,
        createdAt: r.created_at ? new Date(r.created_at) : new Date()
      },
      update: {} // append-only log -- baris lama tidak berubah, cuma dipastikan ada
    });
  }
  console.log(`produk_hpp_history: ${rows.length} baris`);
}

async function migrateProdukLog() {
  const rows = await fetchAll('produk_log');
  for (const r of rows) {
    await prisma.produkLog.upsert({
      where: { id: r.id },
      create: {
        id: r.id, produkId: r.produk_id, produkNama: r.produk_nama, aksi: r.aksi,
        detail: r.detail ?? null, oleh: r.oleh ?? 'user HPP',
        createdAt: r.created_at ? new Date(r.created_at) : new Date()
      },
      update: {}
    });
  }
  console.log(`produk_log: ${rows.length} baris`);
}

async function main() {
  console.log('Migrasi data dari Supabase (Elio Cashier) ke MySQL lokal...');
  console.log('Urutan mengikuti dependency FK: kategori/cabang/material/kondimen dulu, lalu produk, lalu anak-anaknya.\n');

  // Level 1: tanpa dependency ke tabel lain
  await migrateKategoriProduk();
  await migrateCabangHpp();
  await migrateMaterialManual();
  await migrateMaterialKonversi();
  await migrateKondimen();

  // Level 2: depend on level 1
  await migrateProduk();
  await migrateKondimenBahan();

  // Level 3: depend on produk
  await migrateResepBahan();
  await migrateBiayaOperasionalProduk();
  await migrateProdukHppHistory();
  await migrateProdukLog();

  console.log('\nSelesai. Cek jumlah baris di atas vs Supabase (Table Editor), dan sampel nilai hpp_terakhir/harga_jual_disarankan untuk jaga-jaga presisi Decimal terpotong.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migrasi gagal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
