import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

// Dua bentuk pemanggilan yang dipakai app.js:
// ?produkId=X     -> satu produk (layar edit, openEdit())
// ?produkIds=1,2,3 -> banyak produk sekaligus (indikator daftar, hitungIndikatorProduk())
router.get('/', async (req, res) => {
  const { produkId, produkIds } = req.query;
  if (typeof produkId === 'string' && produkId) {
    const rows = await prisma.resepBahan.findMany({ where: { produkId } });
    return res.json(rows);
  }
  if (typeof produkIds === 'string' && produkIds) {
    const ids = produkIds.split(',').filter(Boolean);
    const rows = await prisma.resepBahan.findMany({ where: { produkId: { in: ids } } });
    return res.json(rows);
  }
  res.status(400).json({ error: 'produkId atau produkIds wajib diisi.' });
});

const rowSchema = z.object({
  bahanNamaNormal: z.string().min(1),
  sumberBahan: z.string(),
  qtyPakai: z.number(),
  hargaOverride: z.number().nullable().optional()
});
const replaceSchema = z.object({ produkId: z.string().min(1), rows: z.array(rowSchema) });

// Ganti seluruh baris resep sebuah produk (delete lalu insert) — mereplikasi
// persis pola saveProduk() di app.js lama (bukan diff per baris).
router.post('/replace', async (req, res) => {
  const parsed = replaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data resep tidak valid.' });

  const { produkId, rows } = parsed.data;
  await prisma.$transaction([
    prisma.resepBahan.deleteMany({ where: { produkId } }),
    ...(rows.length
      ? [prisma.resepBahan.createMany({ data: rows.map((r) => ({ id: crypto.randomUUID(), produkId, ...r })) })]
      : [])
  ]);
  res.json({ ok: true });
});

export default router;
