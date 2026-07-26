import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/auth';
import produkRoutes from './routes/produk';
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

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/produk', produkRoutes);
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
