import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { produkId } = req.query;
  if (typeof produkId !== 'string' || !produkId) {
    return res.status(400).json({ error: 'produkId wajib diisi.' });
  }
  const rows = await prisma.biayaOperasionalProduk.findMany({ where: { produkId } });
  res.json(rows);
});

const rowSchema = z.object({ label: z.string(), mode: z.string(), value: z.number() });
const replaceSchema = z.object({ produkId: z.string().min(1), rows: z.array(rowSchema) });

router.post('/replace', async (req, res) => {
  const parsed = replaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data biaya operasional tidak valid.' });

  const { produkId, rows } = parsed.data;
  await prisma.$transaction([
    prisma.biayaOperasionalProduk.deleteMany({ where: { produkId } }),
    ...(rows.length
      ? [prisma.biayaOperasionalProduk.createMany({ data: rows.map((r) => ({ id: crypto.randomUUID(), produkId, ...r })) })]
      : [])
  ]);
  res.json({ ok: true });
});

export default router;
