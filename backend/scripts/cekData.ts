// Sensus & pencarian data HPP -- untuk menjawab "datanya ke mana?".
//
// Dibuat Sep 2026: user yakin pernah mengisi kondimen & resep spageti (dan
// banyak menu lain) untuk Elio Coffeehouse, tapi di aplikasi produknya kosong
// (tanpa cabang, HPP 0). "Hilang" bisa berarti beberapa hal berbeda, dan
// script ini memisahkannya:
//   - soft-delete (is_deleted = 1) -- datanya masih utuh, tinggal dipulihkan;
//   - pernah disimpan (tercatat di log) tapi resepnya sekarang kosong. Simpan
//     dari form SELALU membawa minimal satu bahan (saveProduk() menolak resep
//     kosong), jadi log "buat"/"edit" = resepnya pernah ada;
//   - hanya ada di Supabase lama -- diisi lewat aplikasi lama setelah data
//     disalin ke server baru (dicek dengan --supabase);
//   - tidak ada di mana pun -- tidak pernah tersimpan.
//
// HANYA MEMBACA. Tidak menulis apa pun ke MySQL maupun Supabase.
//
// Pakai (dari folder backend):
//   npm run cek-data
//   npm run cek-data -- spag bolog carbo aglio              # + cari kata kunci
//   npm run cek-data -- spag bolog carbo aglio --supabase   # + bandingkan dgn Supabase lama
// --supabase butuh SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY di .env (sama
// dengan yang dulu dipakai migrate:from-supabase).
import 'dotenv/config';
import { prisma } from '../src/db/prisma';

const HARI_AKTIVITAS = 60;
const argv = process.argv.slice(2);
const pakaiSupabase = argv.includes('--supabase');
const kunci = argv.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase().trim()).filter(Boolean);

function cocok(...teks: (string | null | undefined)[]): boolean {
  return kunci.length > 0 && teks.some((t) => !!t && kunci.some((k) => t.toLowerCase().includes(k)));
}

function wib(d: Date | string | null | undefined, denganJam = true): string {
  if (!d) return '-';
  const t = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(t.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(t);
  const g = (x: string) => parts.find((p) => p.type === x)?.value ?? '00';
  const tgl = `${g('year')}-${g('month')}-${g('day')}`;
  return denganJam ? `${tgl} ${g('hour')}:${g('minute')}` : tgl;
}

function rp(n: unknown): string {
  return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
}

function hitungPer<T>(rows: T[], kunciOf: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(kunciOf(r), (m.get(kunciOf(r)) ?? 0) + 1));
  return m;
}

// Bentuk seragam supaya produk/kondimen dari MySQL & Supabase bisa dibandingkan.
interface Simpan { kapan: Date; aksi: string }
interface ProdukRingkas { id: string; nama: string; hapus: boolean; diubah: Date | null; cabang: string; hpp: number; resep: number; simpan: Simpan | null }
interface KondimenRingkas { id: string; nama: string; hapus: boolean; diubah: Date | null; hpp: number; bahan: number }
interface LogRingkas { id: string; produkId: string; produkNama: string; aksi: string; detail: string; kapan: Date }

// Log "buat"/"edit" terakhir per produk = kapan form produk terakhir disimpan.
function simpanTerakhir(log: LogRingkas[]): Map<string, Simpan> {
  const m = new Map<string, Simpan>();
  for (const l of log) {
    if (l.aksi !== 'buat' && l.aksi !== 'edit') continue;
    const lama = m.get(l.produkId);
    if (!lama || l.kapan > lama.kapan) m.set(l.produkId, { kapan: l.kapan, aksi: l.aksi });
  }
  return m;
}

function keDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function ringkasProduk(p: ProdukRingkas | undefined): string {
  if (!p) return 'TIDAK ADA';
  const status = p.hapus ? `DIHAPUS ${wib(p.diubah)}` : 'aktif';
  const simpan = p.simpan ? `${wib(p.simpan.kapan)} (${p.simpan.aksi})` : '-';
  return `${status} · cabang ${p.cabang} · HPP ${rp(p.hpp)} · resep ${p.resep} bahan · terakhir disimpan ${simpan}`;
}

function ringkasKondimen(k: KondimenRingkas | undefined): string {
  if (!k) return 'TIDAK ADA';
  return `${k.hapus ? `DIHAPUS ${wib(k.diubah)}` : 'aktif'} · HPP total ${rp(k.hpp)} · ${k.bahan} bahan · diubah ${wib(k.diubah)}`;
}

async function bacaMysql() {
  const [produk, kategori, cabang, kondimen, resep, kondimenBahan, log] = await Promise.all([
    prisma.produk.findMany({ select: { id: true, nama: true, cabangHppId: true, hppTerakhir: true, isDeleted: true, updatedAt: true } }),
    prisma.kategoriProduk.findMany({ select: { nama: true, isDeleted: true, updatedAt: true } }),
    prisma.cabangHpp.findMany({ select: { id: true, nama: true, aktif: true } }),
    prisma.kondimen.findMany({ select: { id: true, nama: true, hppTotal: true, isDeleted: true, updatedAt: true } }),
    prisma.resepBahan.findMany({ select: { produkId: true, bahanNamaNormal: true } }),
    prisma.kondimenBahan.findMany({ select: { kondimenId: true, bahanNamaNormal: true, bahanNama: true } }),
    prisma.produkLog.findMany({ select: { id: true, produkId: true, produkNama: true, aksi: true, detail: true, createdAt: true } })
  ]);
  const namaCabang = new Map(cabang.map((c) => [c.id, c.nama]));
  const jmlResep = hitungPer(resep, (r) => r.produkId);
  const jmlBahan = hitungPer(kondimenBahan, (r) => r.kondimenId);
  const logRingkas: LogRingkas[] = log.map((l) => ({ id: l.id, produkId: l.produkId, produkNama: l.produkNama, aksi: l.aksi, detail: l.detail ?? '', kapan: l.createdAt }));
  const simpan = simpanTerakhir(logRingkas);
  return {
    produk: produk.map((p): ProdukRingkas => ({
      id: p.id, nama: p.nama, hapus: p.isDeleted, diubah: p.updatedAt,
      cabang: p.cabangHppId ? namaCabang.get(p.cabangHppId) ?? '(cabang tidak ada)' : '-',
      hpp: Number(p.hppTerakhir), resep: jmlResep.get(p.id) ?? 0, simpan: simpan.get(p.id) ?? null
    })),
    kondimen: kondimen.map((k): KondimenRingkas => ({
      id: k.id, nama: k.nama, hapus: k.isDeleted, diubah: k.updatedAt, hpp: Number(k.hppTotal), bahan: jmlBahan.get(k.id) ?? 0
    })),
    log: logRingkas,
    kategori, cabang, resep, kondimenBahan
  };
}

async function bacaSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env');
  // Sama seperti migrateFromSupabase.ts: supabase-js butuh WebSocket, Node 20
  // belum punya bawaan -> pakai paket `ws`.
  const { createClient } = await import('@supabase/supabase-js');
  const WebSocket = (await import('ws')).default;
  const supabase = createClient(url, key, { realtime: { transport: WebSocket as any } });

  async function semua(table: string): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
      if (error) throw new Error(`gagal baca ${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return rows;
  }

  const [produk, kondimen, cabang, resep, kondimenBahan, log] = await Promise.all(
    ['produk', 'kondimen', 'cabang_hpp', 'resep_bahan', 'kondimen_bahan', 'produk_log'].map(semua)
  );
  const namaCabang = new Map(cabang.map((c: any) => [c.id, c.nama]));
  const jmlResep = hitungPer(resep, (r: any) => r.produk_id);
  const jmlBahan = hitungPer(kondimenBahan, (r: any) => r.kondimen_id);
  const logRingkas: LogRingkas[] = log.map((l: any) => ({
    id: l.id, produkId: l.produk_id, produkNama: l.produk_nama ?? '', aksi: l.aksi ?? '', detail: l.detail ?? '', kapan: keDate(l.created_at) ?? new Date(0)
  }));
  const simpan = simpanTerakhir(logRingkas);
  return {
    produk: produk.map((p: any): ProdukRingkas => ({
      id: p.id, nama: p.nama, hapus: !!p.is_deleted, diubah: keDate(p.updated_at ?? p.created_at),
      cabang: p.cabang_hpp_id ? namaCabang.get(p.cabang_hpp_id) ?? '(cabang tidak ada)' : '-',
      hpp: Number(p.hpp_terakhir) || 0, resep: jmlResep.get(p.id) ?? 0, simpan: simpan.get(p.id) ?? null
    })),
    kondimen: kondimen.map((k: any): KondimenRingkas => ({
      id: k.id, nama: k.nama, hapus: !!k.is_deleted, diubah: keDate(k.updated_at ?? k.created_at), hpp: Number(k.hpp_total) || 0, bahan: jmlBahan.get(k.id) ?? 0
    })),
    log: logRingkas
  };
}

async function main() {
  let namaDb = '?';
  try { namaDb = new URL(process.env.DATABASE_URL || '').pathname.replace(/^\//, '') || '?'; } catch { /* biarkan '?' */ }
  console.log(`CEK DATA HPP — database "${namaDb}", ${wib(new Date())} WIB`);
  if (kunci.length) console.log(`Kata kunci: ${kunci.join(', ')} (baris yang cocok ditandai »)`);
  console.log('Hanya membaca. Tidak ada data yang diubah.');

  const baru = await bacaMysql();

  let lama: Awaited<ReturnType<typeof bacaSupabase>> | null = null;
  if (pakaiSupabase) {
    try {
      lama = await bacaSupabase();
    } catch (err: any) {
      console.log(`\n!! Supabase lama tidak bisa dibaca: ${err.message}`);
    }
  }

  // ---------------- Ringkasan ----------------
  const aktif = baru.produk.filter((p) => !p.hapus);
  console.log('\n1) RINGKASAN DATABASE BARU');
  console.log(`  produk: ${aktif.length} aktif, ${baru.produk.length - aktif.length} dihapus · resep: ${aktif.filter((p) => p.resep).length} produk aktif punya resep`);
  console.log(`  produk aktif tanpa cabang (tidak tampil saat satu cabang dipilih): ${aktif.filter((p) => p.cabang === '-').length}`);
  console.log(`  kondimen: ${baru.kondimen.filter((k) => !k.hapus).length} aktif, ${baru.kondimen.filter((k) => k.hapus).length} dihapus`);
  const katHapus = baru.kategori.filter((k) => k.isDeleted);
  console.log(`  kategori dihapus: ${katHapus.length}${katHapus.length ? ' — ' + katHapus.map((k) => `${k.nama} (${wib(k.updatedAt, false)})`).join(', ') : ''}`);
  const urutLog = [...baru.log].sort((a, b) => a.kapan.getTime() - b.kapan.getTime());
  console.log(`  log produk: ${baru.log.length} baris, pertama ${wib(urutLog[0]?.kapan)}, terakhir ${wib(urutLog[urutLog.length - 1]?.kapan)}`);
  if (lama) {
    const idLogBaru = new Set(baru.log.map((l) => l.id));
    const logHanyaLama = lama.log.filter((l) => !idLogBaru.has(l.id)).sort((a, b) => a.kapan.getTime() - b.kapan.getTime());
    const terakhirLama = [...lama.log].sort((a, b) => a.kapan.getTime() - b.kapan.getTime()).pop();
    console.log(`  Supabase lama: log terakhir ${wib(terakhirLama?.kapan)} · ${logHanyaLama.length} log TIDAK pernah pindah ke database baru` +
      (logHanyaLama.length ? ` (${wib(logHanyaLama[0].kapan)} s/d ${wib(logHanyaLama[logHanyaLama.length - 1].kapan)})` : ''));
  }

  // ---------------- Semua produk ----------------
  // Satu baris per produk; kalau --supabase, baris kedua = keadaannya di
  // Supabase lama. Tanda ⚠ = kemungkinan besar di sinilah data yang dicari.
  const semuaId = new Map<string, string>();
  baru.produk.forEach((p) => semuaId.set(p.id, p.nama));
  lama?.produk.forEach((p) => { if (!semuaId.has(p.id)) semuaId.set(p.id, p.nama); });
  const baruById = new Map(baru.produk.map((p) => [p.id, p]));
  const lamaById = new Map((lama?.produk ?? []).map((p) => [p.id, p]));
  let jmlTanda = 0;
  console.log(`\n2) SEMUA PRODUK${lama ? ' — database baru vs Supabase lama' : ''} (termasuk yang dihapus)`);
  for (const [id, nama] of [...semuaId].sort((a, b) => a[1].localeCompare(b[1], 'id'))) {
    const b = baruById.get(id);
    const l = lamaById.get(id);
    const tanda: string[] = [];
    if (b && !b.hapus && !b.resep && b.simpan) tanda.push(`pernah disimpan dgn resep (${wib(b.simpan.kapan)}), sekarang resepnya kosong`);
    if (b?.hapus) tanda.push('dihapus di database baru, bisa dipulihkan');
    if (l && !b) tanda.push('produk ini HANYA ada di Supabase lama');
    if (l && b && l.resep > 0 && !b.resep) tanda.push('resepnya ada di Supabase lama');
    if (l?.simpan && (!b?.simpan || l.simpan.kapan > b.simpan.kapan)) tanda.push('terakhir disimpan lewat aplikasi LAMA');
    if (tanda.length) jmlTanda++;
    console.log(`  ${cocok(nama) ? '» ' : ''}${nama}${tanda.length ? '   ⚠ ' + tanda.join('; ') : ''}`);
    console.log(`      baru: ${ringkasProduk(b)}`);
    if (lama) console.log(`      lama: ${ringkasProduk(l)}`);
  }
  console.log(`  → ${jmlTanda} produk bertanda ⚠`);

  // ---------------- Semua kondimen ----------------
  const kondimenId = new Map<string, string>();
  baru.kondimen.forEach((k) => kondimenId.set(k.id, k.nama));
  lama?.kondimen.forEach((k) => { if (!kondimenId.has(k.id)) kondimenId.set(k.id, k.nama); });
  const kBaru = new Map(baru.kondimen.map((k) => [k.id, k]));
  const kLama = new Map((lama?.kondimen ?? []).map((k) => [k.id, k]));
  console.log(`\n3) SEMUA KONDIMEN${lama ? ' — database baru vs Supabase lama' : ''} (termasuk yang dihapus)`);
  for (const [id, nama] of [...kondimenId].sort((a, b) => a[1].localeCompare(b[1], 'id'))) {
    const b = kBaru.get(id);
    const l = kLama.get(id);
    const tanda: string[] = [];
    if (b?.hapus) tanda.push('dihapus, bisa dipulihkan');
    if (l && !b) tanda.push('HANYA ada di Supabase lama');
    if (l && b && l.bahan > 0 && !b.bahan) tanda.push('bahannya ada di Supabase lama');
    const pemakai = baru.resep.filter((r) => r.bahanNamaNormal === `kondimen:${id}`).map((r) => baruById.get(r.produkId)?.nama ?? '?');
    console.log(`  ${cocok(nama) ? '» ' : ''}${nama}${tanda.length ? '   ⚠ ' + tanda.join('; ') : ''}`);
    console.log(`      baru: ${ringkasKondimen(b)}${pemakai.length ? ' · dipakai di: ' + [...new Set(pemakai)].join(', ') : ''}`);
    if (lama) console.log(`      lama: ${ringkasKondimen(l)}`);
  }

  // ---------------- Aktivitas ----------------
  const sejak = Date.now() - HARI_AKTIVITAS * 24 * 3600 * 1000;
  const perHari = new Map<string, Map<string, number>>();
  for (const l of [...baru.log, ...(lama?.log ?? []).filter((x) => !baru.log.some((y) => y.id === x.id))]) {
    if (l.kapan.getTime() < sejak || l.aksi === 'update-harga-otomatis') continue;
    const hari = wib(l.kapan, false);
    const m = perHari.get(hari) ?? new Map<string, number>();
    m.set(l.aksi, (m.get(l.aksi) ?? 0) + 1);
    perHari.set(hari, m);
  }
  console.log(`\n4) AKTIVITAS MANUAL ${HARI_AKTIVITAS} HARI TERAKHIR (log buat/edit/hapus/update-harga${lama ? ', gabungan kedua database' : ''})`);
  if (!perHari.size) console.log('  tidak ada');
  for (const [hari, m] of [...perHari].sort((a, b) => b[0].localeCompare(a[0]))) {
    console.log(`  ${hari}  ${[...m].map(([aksi, n]) => `${aksi} ${n}`).join(' · ')}`);
  }

  // ---------------- Kata kunci ----------------
  if (kunci.length) {
    console.log('\n5) KATA KUNCI DI TEMPAT LAIN');
    const idLogBaru = new Set(baru.log.map((l) => l.id));
    const logCocok = [...baru.log, ...(lama?.log ?? []).filter((l) => !idLogBaru.has(l.id))]
      .filter((l) => cocok(l.produkNama, l.detail))
      .sort((a, b) => a.kapan.getTime() - b.kapan.getTime());
    console.log(`  log yang menyebut kata kunci: ${logCocok.length}`);
    logCocok.slice(-40).forEach((l) =>
      console.log(`    - ${wib(l.kapan)}  ${l.aksi}  ${l.produkNama}${l.detail ? ' — ' + l.detail.slice(0, 80) : ''}${idLogBaru.has(l.id) ? '' : '  [hanya di Supabase lama]'}`));
    const resepCocok = baru.resep.filter((r) => cocok(r.bahanNamaNormal));
    console.log(`  bahan resep yang cocok: ${resepCocok.length}${resepCocok.length ? ' — ' + [...new Set(resepCocok.map((r) => `${baruById.get(r.produkId)?.nama ?? '?'}: ${r.bahanNamaNormal}`))].join(', ') : ''}`);
    const kbCocok = baru.kondimenBahan.filter((r) => cocok(r.bahanNamaNormal, r.bahanNama));
    console.log(`  bahan kondimen yang cocok: ${kbCocok.length}${kbCocok.length ? ' — ' + [...new Set(kbCocok.map((r) => `${kBaru.get(r.kondimenId)?.nama ?? '?'}: ${r.bahanNama}`))].join(', ') : ''}`);
  }

  if (!pakaiSupabase) console.log('\n(Supabase lama tidak dicek. Tambahkan --supabase untuk membandingkan.)');
  console.log('\nSelesai. Tidak ada data yang diubah.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Gagal:', err);
    process.exit(1);
  });
