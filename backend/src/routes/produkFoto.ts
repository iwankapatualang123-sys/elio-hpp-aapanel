import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

// Foto plating per produk (base64 data URL, disimpan di tabel terpisah supaya
// daftar produk tidak berat). Lihat catatan di schema.prisma model ProdukFoto.
const router = Router();
router.use(requireAuth);

// GET /api/produk-foto/:produkId -> row {produk_id,data,updated_at} atau null
router.get('/:produkId', async (req, res) => {
  const row = await prisma.produkFoto.findUnique({ where: { produkId: req.params.produkId } });
  res.json(row || null);
});

// Cap 6 juta char (~4.5MB gambar) — jauh di atas foto ter-resize (<1MB) tapi
// mencegah baris raksasa. app.js sudah mengecilkan sebelum kirim.
const bodySchema = z.object({ data: z.string().min(1).max(6000000) });

// PUT /api/produk-foto/:produkId -> upsert
router.put('/:produkId', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data foto tidak valid.' });
  const row = await prisma.produkFoto.upsert({
    where: { produkId: req.params.produkId },
    create: { produkId: req.params.produkId, data: parsed.data.data },
    update: { data: parsed.data.data }
  });
  res.json(row);
});

// DELETE /api/produk-foto/:produkId (deleteMany: aman walau barisnya tidak ada)
router.delete('/:produkId', async (req, res) => {
  await prisma.produkFoto.deleteMany({ where: { produkId: req.params.produkId } });
  res.json({ ok: true });
});

export default router;
