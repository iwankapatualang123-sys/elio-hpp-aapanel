import { Router } from 'express';
import { getHargaAcuanMaterial } from '../lib/hargaAcuanClient';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const { rows, available } = await getHargaAcuanMaterial();
  // available:false (tapi rows tetap dikirim — cache basi kalau ada, atau
  // kosong) supaya frontend bisa menandai "harga referensi tidak tersedia"
  // tanpa meng-crash seluruh halaman produk. Lihat lib/hargaAcuanClient.ts.
  res.json({ rows, available });
});

export default router;
