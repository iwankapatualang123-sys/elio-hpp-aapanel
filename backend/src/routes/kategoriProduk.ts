import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.kategoriProduk.findMany({
    where: { isDeleted: false },
    orderBy: [{ level: 'asc' }, { urutan: 'asc' }]
  });
  res.json(rows);
});

const rowSchema = z.object({
  nama: z.string().min(1),
  parentId: z.string().nullable().optional(),
  level: z.number().int(),
  urutan: z.number().int().default(0)
});

router.post('/', async (req, res) => {
  const parsed = rowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data kategori tidak valid.' });
  const row = await prisma.kategoriProduk.create({ data: { id: crypto.randomUUID(), ...parsed.data } });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const parsed = rowSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data kategori tidak valid.' });
  const row = await prisma.kategoriProduk.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(row);
});

router.delete('/:id', async (req, res) => {
  await prisma.kategoriProduk.update({ where: { id: req.params.id }, data: { isDeleted: true } });
  res.json({ ok: true });
});

export default router;
