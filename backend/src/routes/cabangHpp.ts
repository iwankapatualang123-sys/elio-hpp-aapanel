import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.cabangHpp.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(rows);
});

const rowSchema = z.object({ nama: z.string().min(1), aktif: z.boolean().default(true) });

router.post('/', async (req, res) => {
  const parsed = rowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data cabang tidak valid.' });
  const row = await prisma.cabangHpp.create({ data: { id: crypto.randomUUID(), ...parsed.data } });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const parsed = rowSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data cabang tidak valid.' });
  const row = await prisma.cabangHpp.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(row);
});

// Tidak ada is_deleted di cabang_hpp (lihat loadCabang() di app.js lama) —
// nonaktifkan lewat aktif:false, konsisten dengan cara UI menyaring
// (cabangList.filter(c => c.aktif)), bukan hard delete.
router.delete('/:id', async (req, res) => {
  await prisma.cabangHpp.update({ where: { id: req.params.id }, data: { aktif: false } });
  res.json({ ok: true });
});

export default router;
