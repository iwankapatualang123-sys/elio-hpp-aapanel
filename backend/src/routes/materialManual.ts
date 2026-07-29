import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.materialManual.findMany();
  res.json(rows);
});

const rowSchema = z.object({
  nama: z.string().min(1),
  hargaPerSatuan: z.number(),
  satuan: z.string().min(1)
});

router.post('/', async (req, res) => {
  const parsed = rowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data bahan manual tidak valid.' });
  const row = await prisma.materialManual.create({ data: { id: crypto.randomUUID(), ...parsed.data } });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const parsed = rowSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data bahan manual tidak valid.' });
  const row = await prisma.materialManual.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(row);
});

router.delete('/:id', async (req, res) => {
  await prisma.materialManual.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
