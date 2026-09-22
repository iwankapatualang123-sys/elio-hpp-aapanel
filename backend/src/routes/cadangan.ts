import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { buatCadangan, daftarCadangan, pathCadangan, statusCadangan, terimaKeadaanSekarang } from '../lib/cadangan';

// Cadangan data HPP -- lihat penjelasan lengkap di src/lib/cadangan.ts.
const router = Router();
router.use(requireAuth);

// Status untuk banner peringatan di aplikasi (dipanggil sekali saat login).
router.get('/status', async (_req, res) => {
  res.json(await statusCadangan());
});

router.get('/', async (_req, res) => {
  res.json(daftarCadangan());
});

router.post('/', async (_req, res) => {
  res.json(await buatCadangan('manual'));
});

// Unduh lewat fetch ber-header Authorization (bukan link biasa), karena endpoint
// ini wajib login. Nama berkas divalidasi ketat di pathCadangan().
router.get('/unduh/:nama', (req, res) => {
  const p = pathCadangan(req.params.nama);
  if (!p) return res.status(404).json({ error: 'Cadangan tidak ditemukan.' });
  res.download(p, req.params.nama);
});

// Matikan alarm "database mundur" setelah user menerima keadaan sekarang dengan
// sadar. Sengaja cuma boleh saat alarm memang menyala.
router.post('/terima', async (_req, res) => {
  const s = await statusCadangan();
  if (!s.mundur) return res.status(400).json({ error: 'Tidak ada peringatan yang perlu diterima.' });
  res.json(await terimaKeadaanSekarang());
});

export default router;
