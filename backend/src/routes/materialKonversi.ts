import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.materialKonversi.findMany();
  res.json(rows);
});

const upsertSchema = z.object({
  namaNormal: z.string().min(1),
  nama: z.string().min(1),
  isiPerKemasan: z.number(),
  satuanPakai: z.string().min(1)
});

// Mereplikasi supabase .upsert(..., {onConflict:'nama_normal'}) dari
// simpanKonversi() di app.js lama — namaNormal memang primary key di sini.
router.post('/', async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data konversi tidak valid.' });

  const { namaNormal, ...rest } = parsed.data;
  const row = await prisma.materialKonversi.upsert({
    where: { namaNormal },
    create: { namaNormal, ...rest },
    update: rest
  });
  res.json(row);
});

// Hapus konversi satuan sebuah material (dipakai halaman Bahan -> "reset satuan").
// Bahan acuan sendiri datang dari Cashflow (tidak bisa dihapus dari sini); yang
// dihapus cuma baris isi/satuan-nya, jadi material balik butuh "Lengkapi satuan".
router.delete('/:namaNormal', async (req, res) => {
  const namaNormal = decodeURIComponent(req.params.namaNormal);
  await prisma.materialKonversi.deleteMany({ where: { namaNormal } });
  res.json({ ok: true });
});

export default router;
