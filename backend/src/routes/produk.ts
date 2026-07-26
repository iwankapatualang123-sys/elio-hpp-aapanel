import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.produk.findMany({
    where: { isDeleted: false, jenis: 'fnb' },
    orderBy: { createdAt: 'desc' }
  });
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.produk.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  res.json(row);
});

const produkSchema = z.object({
  nama: z.string().min(1),
  jenis: z.string().default('fnb'),
  kategori: z.string().nullable().optional(),
  kategoriId: z.string().nullable().optional(),
  cabangHppId: z.string().nullable().optional(),
  overheadPersen: z.number(),
  targetMarginPersen: z.number(),
  hppTerakhir: z.number(),
  hargaJualDisarankan: z.number(),
  caraProses: z.string().nullable().optional()
});

router.post('/', async (req, res) => {
  const parsed = produkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data produk tidak valid.', detail: parsed.error.flatten() });

  const row = await prisma.produk.create({ data: { id: crypto.randomUUID(), ...parsed.data } });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const parsed = produkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data produk tidak valid.', detail: parsed.error.flatten() });

  const row = await prisma.produk.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(row);
});

// Soft delete — persis perilaku lama (`update({is_deleted:true})`), bukan hard delete.
router.delete('/:id', async (req, res) => {
  await prisma.produk.update({ where: { id: req.params.id }, data: { isDeleted: true } });
  res.json({ ok: true });
});

export default router;
