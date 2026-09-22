import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { env } from './config/env';
import { refreshSemuaHarga } from './jobs/refreshHarga';
import authRoutes from './routes/auth';
import produkRoutes from './routes/produk';
import produkFotoRoutes from './routes/produkFoto';
import resepBahanRoutes from './routes/resepBahan';
import biayaOperasionalProdukRoutes from './routes/biayaOperasionalProduk';
import produkHppHistoryRoutes from './routes/produkHppHistory';
import produkLogRoutes from './routes/produkLog';
import kategoriProdukRoutes from './routes/kategoriProduk';
import cabangHppRoutes from './routes/cabangHpp';
import materialKonversiRoutes from './routes/materialKonversi';
import materialManualRoutes from './routes/materialManual';
import kondimenRoutes from './routes/kondimen';
import hargaAcuanMaterialRoutes from './routes/hargaAcuanMaterial';
import widgetRoutes from './routes/widget';
import cadanganRoutes from './routes/cadangan';
import { buatCadangan, daftarCadangan, cekMundur } from './lib/cadangan';

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/produk-foto', produkFotoRoutes);
app.use('/api/resep-bahan', resepBahanRoutes);
app.use('/api/biaya-operasional-produk', biayaOperasionalProdukRoutes);
app.use('/api/produk-hpp-history', produkHppHistoryRoutes);
app.use('/api/produk-log', produkLogRoutes);
app.use('/api/kategori-produk', kategoriProdukRoutes);
app.use('/api/cabang-hpp', cabangHppRoutes);
app.use('/api/material-konversi', materialKonversiRoutes);
app.use('/api/material-manual', materialManualRoutes);
app.use('/api/kondimen', kondimenRoutes);
app.use('/api/harga-acuan-material', hargaAcuanMaterialRoutes);
// Read-only, token-protected (bukan requireAuth) -- dipakai widget iframe.
app.use('/api/widget', widgetRoutes);
app.use('/api/cadangan', cadanganRoutes);

// Centralized error handler — any unhandled throw in a route lands here
// instead of crashing the process or leaking a stack trace to the client.
// `express-async-errors` (imported above, before any route) is what makes
// throws inside `async` handlers actually reach this, not just synchronous ones.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(env.port, () => {
  console.log(`Elio HPP backend listening on port ${env.port}`);
});

// Refresh HPP semua produk otomatis tiap hari jam 03:00 (waktu server) --
// versi terjadwal dari tombol "Update Harga" manual di Daftar Produk.
// TIDAK PERNAH menyentuh harga_jual_aktual, lihat src/jobs/refreshHarga.ts.
cron.schedule('0 3 * * *', async () => {
  console.log('[refreshHarga] mulai jalan otomatis...');
  try {
    const hasil = await refreshSemuaHarga();
    console.log('[refreshHarga] selesai:', hasil);
  } catch (err: any) {
    console.error('[refreshHarga] gagal:', err.message);
  }
});

// Cadangan data HPP harian jam 02:30 -- SEBELUM refresh HPP jam 03:00, supaya
// yang tersimpan adalah keadaan sebelum angka-angka dihitung ulang. Lihat
// src/lib/cadangan.ts untuk alasan lengkapnya (insiden 15 Sep 2026).
cron.schedule('30 2 * * *', async () => {
  try {
    const h = await buatCadangan('jadwal');
    if (h.mundur) console.error('[cadangan] PERINGATAN -- database terdeteksi MUNDUR:', h.alasan.join(' '));
    else console.log('[cadangan] dibuat:', h.nama, h.ukuran, 'byte');
  } catch (err: any) {
    console.error('[cadangan] gagal:', err.message);
  }
});

// Saat server menyala: periksa apakah database mundur (mis. baru di-restore
// saat server sedang mati), dan buat cadangan kalau yang terakhir sudah lewat
// 20 jam atau belum ada sama sekali -- supaya server yang lama mati tidak
// melewatkan jadwal harian, dan deploy pertama langsung punya satu cadangan.
setTimeout(async () => {
  try {
    const s = await cekMundur();
    if (s.mundur) console.error('[cadangan] PERINGATAN -- database terdeteksi MUNDUR:', s.alasan.join(' '));
    const terakhir = daftarCadangan()[0];
    const umurJam = terakhir ? (Date.now() - new Date(terakhir.waktu).getTime()) / 3600000 : Infinity;
    if (umurJam > 20) {
      const h = await buatCadangan('awal');
      console.log('[cadangan] cadangan awal dibuat:', h.nama);
    }
  } catch (err: any) {
    console.error('[cadangan] pemeriksaan awal gagal:', err.message);
  }
}, 5000);
