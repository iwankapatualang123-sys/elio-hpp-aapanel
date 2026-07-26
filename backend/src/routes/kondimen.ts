import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.kondimen.findMany({ where: { isDeleted: false }, orderBy: { nama: 'asc' } });
  res.json(rows);
});

const rowSchema = z.object({
  nama: z.string().min(1),
  satuanHasil: z.string().min(1),
  totalHasil: z.number(),
  hppTotal: z.number(),
  hppPerSatuan: z.number(),
  catatan: z.string().nullable().optional()
});

router.post('/', async (req, res) => {
  const parsed = rowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data kondimen tidak valid.' });
  const row = await prisma.kondimen.create({ data: { id: crypto.randomUUID(), ...parsed.data } });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const parsed = rowSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data kondimen tidak valid.' });
  const row = await prisma.kondimen.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(row);
});

router.delete('/:id', async (req, res) => {
  await prisma.kondimen.update({ where: { id: req.params.id }, data: { isDeleted: true } });
  res.json({ ok: true });
});

// --- Bahan (resep) per kondimen ---
router.get('/:id/bahan', async (req, res) => {
  const rows = await prisma.kondimenBahan.findMany({ where: { kondimenId: req.params.id } });
  res.json(rows);
});

const bahanRowSchema = z.object({
  bahanNamaNormal: z.string().min(1),
  bahanNama: z.string().min(1),
  sumberBahan: z.string(),
  qtyPakai: z.number(),
  isiKemasan: z.number().nullable().optional(),
  satuan: z.string().nullable().optional(),
  hargaOverride: z.number().nullable().optional()
});
const replaceBahanSchema = z.object({ rows: z.array(bahanRowSchema) });

router.post('/:id/bahan/replace', async (req, res) => {
  const parsed = replaceBahanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data bahan kondimen tidak valid.' });

  const kondimenId = req.params.id;
  const { rows } = parsed.data;
  await prisma.$transaction([
    prisma.kondimenBahan.deleteMany({ where: { kondimenId } }),
    ...(rows.length
      ? [prisma.kondimenBahan.createMany({ data: rows.map((r) => ({ id: crypto.randomUUID(), kondimenId, ...r })) })]
      : [])
  ]);
  res.json({ ok: true });
});

export default router;
