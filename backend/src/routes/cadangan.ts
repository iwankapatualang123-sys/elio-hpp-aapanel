import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { buatCadangan, daftarCadangan, pathCadangan, statusCadangan, terimaKeadaanSekarang, bacaIsiCadangan, parseIsiCadangan, pulihkanDariIsi } from '../lib/cadangan';

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

// PEMULIHAN dari cadangan JSON yang ada di server. MENIMPA seluruh data sekarang.
// Frontend wajib konfirmasi ketat (ketik PULIHKAN) sebelum memanggil ini.
router.post('/pulihkan/:nama', async (req, res) => {
  try {
    const isi = bacaIsiCadangan(req.params.nama);
    res.json(await pulihkanDariIsi(isi));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Pemulihan gagal.' });
  }
});

// PEMULIHAN dari berkas cadangan JSON yang DIUNGGAH user (base64 dari .json.gz).
// Untuk kasus server kehilangan backup-nya & salinan cuma ada di komputer user.
router.post('/pulihkan-unggah', async (req, res) => {
  try {
    const b64 = (req.body && req.body.b64) || '';
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'Berkas tidak ada.' });
    const isi = parseIsiCadangan(Buffer.from(b64, 'base64'));
    res.json(await pulihkanDariIsi(isi));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Pemulihan gagal.' });
  }
});

export default router;
