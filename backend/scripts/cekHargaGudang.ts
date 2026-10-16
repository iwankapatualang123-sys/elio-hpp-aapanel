// Laporan: bahan mana yang harganya akan BERUBAH kalau HPP memakai harga SKU
// gudang, bukan "pembelian terakhir dari sumber mana pun".
//
// Latar: view harga_acuan_material di Cashflow mengambil pembelian TERBARU per
// nama bahan, tidak peduli dari gudang atau belanja harian. Jadi sebuah SKU
// gudang bisa tergeser harganya begitu ada yang membelinya lewat belanja
// harian dengan nama yang sama. User ingin bahan gudang terkunci ke harga
// SKU-nya. Skrip ini memperlihatkan dampaknya SEBELUM apa pun diubah.
//
// HANYA MEMBACA (MySQL & PostgreSQL Cashflow). Tidak mengubah apa pun.
//
// Butuh view `harga_acuan_per_sumber` di Cashflow (harga terbaru PER SUMBER).
// Kalau belum ada, skrip berhenti dengan pesan yang jelas.
import { Pool } from 'pg';
import { prisma } from '../src/db/prisma';
import { env } from '../src/config/env';

interface Baris { harga: number; tanggal: string; sku: string | null }

async function main() {
  if (!env.hargaAcuanDatabaseUrl) {
    console.error('HARGA_ACUAN_DATABASE_URL belum diisi di .env — tidak bisa membaca harga Cashflow.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: env.hargaAcuanDatabaseUrl, ssl: false, max: 2 });
  let rows: { nama_normal: string; sumber: string; harga_per_unit_beli: string | null; tanggal_terakhir: string | null; sku: string | null }[];
  try {
    const r = await pool.query(`SELECT nama_normal, sumber, harga_per_unit_beli, tanggal_terakhir, sku FROM harga_acuan_per_sumber`);
    rows = r.rows;
  } catch (err: any) {
    console.error('Gagal membaca harga_acuan_per_sumber:', err.message);
    console.error('View itu perlu dibuat dulu di database Cashflow (harga terbaru per sumber).');
    process.exit(1);
  }

  const gudang = new Map<string, Baris>();
  const harian = new Map<string, Baris>();
  for (const r of rows) {
    const b: Baris = { harga: Number(r.harga_per_unit_beli) || 0, tanggal: String(r.tanggal_terakhir || ''), sku: r.sku };
    (r.sumber === 'warehouse' ? gudang : harian).set(r.nama_normal, b);
  }
  // Harga yang BERLAKU sekarang = pembelian terbaru dari sumber mana pun,
  // meniru aturan view harga_acuan_material yang dipakai aplikasi hari ini.
  const sekarang = (nama: string): { harga: number; sumber: string } | null => {
    const g = gudang.get(nama), h = harian.get(nama);
    if (g && h) return h.tanggal > g.tanggal ? { harga: h.harga, sumber: 'harian' } : { harga: g.harga, sumber: 'gudang' };
    if (g) return { harga: g.harga, sumber: 'gudang' };
    if (h) return { harga: h.harga, sumber: 'harian' };
    return null;
  };

  const konversi = new Map((await prisma.materialKonversi.findMany()).map((k) => [k.namaNormal, Number(k.isiPerKemasan) || 1]));
  const produk = await prisma.produk.findMany({ where: { isDeleted: false, jenis: 'fnb' }, select: { id: true, nama: true, hppTerakhir: true } });
  const resep = await prisma.resepBahan.findMany({ where: { produkId: { in: produk.map((p) => p.id) } } });

  // 1) bahan yang harganya akan berubah
  const dipakai = new Map<string, number>(); // nama -> jumlah resep yang memakainya
  resep.forEach((r) => dipakai.set(r.bahanNamaNormal, (dipakai.get(r.bahanNamaNormal) || 0) + 1));

  const berubah: { nama: string; dari: number; ke: number; sumberLama: string; sku: string | null; dipakai: number }[] = [];
  for (const [nama, jml] of dipakai) {
    if (nama.startsWith('kondimen:')) continue;
    const g = gudang.get(nama);
    const s = sekarang(nama);
    if (!g || !s) continue;              // tidak punya harga gudang -> tidak terpengaruh
    if (Math.abs(g.harga - s.harga) < 0.01) continue;
    berubah.push({ nama, dari: s.harga, ke: g.harga, sumberLama: s.sumber, sku: g.sku, dipakai: jml });
  }
  berubah.sort((a, b) => Math.abs(b.ke / (b.dari || 1) - 1) - Math.abs(a.ke / (a.dari || 1) - 1));

  const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  console.log(`Bahan dipakai di resep        : ${dipakai.size}`);
  console.log(`Punya harga gudang            : ${[...dipakai.keys()].filter((n) => gudang.has(n)).length}`);
  console.log(`Harganya akan BERUBAH         : ${berubah.length}\n`);
  if (berubah.length) {
    console.log('bahan'.padEnd(30) + 'sekarang'.padStart(12) + 'jadi(gudang)'.padStart(14) + '  selisih   dipakai  SKU');
    berubah.slice(0, 25).forEach((b) => {
      const pct = b.dari ? ((b.ke / b.dari - 1) * 100).toFixed(0) + '%' : '-';
      console.log(b.nama.slice(0, 29).padEnd(30) + rp(b.dari).padStart(12) + rp(b.ke).padStart(14) + ('  ' + pct).padStart(9) + String(b.dipakai).padStart(9) + '  ' + (b.sku || ''));
    });
    if (berubah.length > 25) console.log(`  ... dan ${berubah.length - 25} bahan lain`);
  }

  // 2) perkiraan dampak ke HPP produk (hanya bagian material yang bisa dihitung
  // di sini; biaya ops & overhead tidak diikutkan karena proporsional saja)
  const petaBerubah = new Map(berubah.map((b) => [b.nama, b]));
  const dampak: { nama: string; selisih: number; bahan: string[] }[] = [];
  for (const p of produk) {
    const baris = resep.filter((r) => r.produkId === p.id);
    let selisih = 0;
    const kena: string[] = [];
    for (const r of baris) {
      if (r.hargaOverride !== null && r.hargaOverride !== undefined) continue; // harga dikunci manual
      const b = petaBerubah.get(r.bahanNamaNormal);
      if (!b) continue;
      const isi = konversi.get(r.bahanNamaNormal) || 1;
      selisih += ((b.ke - b.dari) / (isi || 1)) * Number(r.qtyPakai || 0);
      kena.push(r.bahanNamaNormal);
    }
    if (Math.abs(selisih) >= 1) dampak.push({ nama: p.nama, selisih, bahan: kena });
  }
  dampak.sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih));
  console.log(`\nProduk yang HPP-nya ikut bergeser: ${dampak.length} dari ${produk.length}`);
  dampak.slice(0, 15).forEach((d) => {
    const tanda = d.selisih > 0 ? '+' : '';
    console.log(`  ${d.nama.slice(0, 34).padEnd(35)} ${(tanda + rp(d.selisih)).padStart(12)}   (${d.bahan.slice(0, 3).join(', ')}${d.bahan.length > 3 ? ', …' : ''})`);
  });
  if (dampak.length > 15) console.log(`  ... dan ${dampak.length - 15} produk lain`);
  console.log('\nBelum ada yang diubah — ini hanya perkiraan dampak.');
  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Gagal:', err); process.exit(1); });
