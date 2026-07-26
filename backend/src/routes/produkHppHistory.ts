import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

// Bulk by produkIds, urut terbaru dulu — dipakai hitungIndikatorProduk() untuk
// panah tren & sparkline (frontend memotong ke 12 titik terakhir sendiri).
router.get('/', async (req, res) => {
  const { produkIds } = req.query;
  if (typeof produkIds !== 'string' || !produkIds) {
    return res.status(400).json({ error: 'produkIds wajib diisi.' });
  }
  const ids = produkIds.split(',').filter(Boolean);
  const rows = await prisma.produkHppHistory.findMany({
    where: { produkId: { in: ids } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(rows);
});

const insertSchema = z.object({
  produkId: z.string().min(1),
  hpp: z.number(),
  hargaJual: z.number(),
  marginPersen: z.number()
});

router.post('/', async (req, res) => {
  const parsed = insertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data riwayat HPP tidak valid.' });

  const row = await prisma.produkHppHistory.create({ data: { id: crypto.randomUUID(), ...parsed.data } });
  res.status(201).json(row);
});

export default router;
