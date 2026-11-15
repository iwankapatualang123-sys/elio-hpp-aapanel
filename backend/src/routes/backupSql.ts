import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { buatBackupSql, daftarBackupSql, pathBackupSql, pulihkanDariSqlPath, pulihkanDariSqlGzBuffer } from '../lib/backupSql';

// Backup & restore format SQL (mysqldump). Semua butuh login. Lihat lib/backupSql.ts.
const router = Router();
router.use(requireAuth);

// Daftar file SQL di server.
router.get('/', async (_req, res) => {
  res.json(daftarBackupSql());
});

// Buat SQL dump baru SEKARANG lalu langsung unduh (tetap tersimpan + rotasi).
router.get('/buat', async (_req, res) => {
  try {
    const b = await buatBackupSql();
    res.download(b.path, b.nama);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Backup SQL gagal.' });
  }
});

// Unduh file SQL tertentu yang sudah ada.
router.get('/unduh/:nama', (req, res) => {
  const p = pathBackupSql(req.params.nama);
  if (!p) return res.status(404).json({ error: 'Backup SQL tidak ditemukan.' });
  res.download(p, req.params.nama);
});

// PEMULIHAN dari file SQL di server (menimpa DB). Konfirmasi ketat di frontend.
router.post('/pulihkan/:nama', async (req, res) => {
  const p = pathBackupSql(req.params.nama);
  if (!p) return res.status(404).json({ error: 'Backup SQL tidak ditemukan.' });
  try {
    res.json(await pulihkanDariSqlPath(p));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Pemulihan SQL gagal.' });
  }
});

// PEMULIHAN dari file .sql.gz yang DIUNGGAH user (base64).
router.post('/pulihkan-unggah', async (req, res) => {
  try {
    const b64 = (req.body && req.body.b64) || '';
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'Berkas tidak ada.' });
    res.json(await pulihkanDariSqlGzBuffer(Buffer.from(b64, 'base64')));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Pemulihan SQL gagal.' });
  }
});

export default router;
