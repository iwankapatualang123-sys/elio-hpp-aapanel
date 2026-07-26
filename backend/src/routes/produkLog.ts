import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

// Layar "Log perubahan" (Kelola) menampilkan feed global terbaru, bukan
// per-produk — makanya produk_nama didenormalisasi di tabel ini sejak awal.
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);
  const rows = await prisma.produkLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  res.json(rows);
});

const insertSchema = z.object({
  produkId: z.string().min(1),
  produkNama: z.string(),
  aksi: z.string(),
  detail: z.string().nullable().optional()
});

router.post('/', async (req, res) => {
  const parsed = insertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data log tidak valid.' });

  // oleh selalu "user HPP" — satu akun bersama, tidak ada identitas per-user
  // untuk direkam (lihat lib/auth.ts).
  const row = await prisma.produkLog.create({ data: { id: crypto.randomUUID(), oleh: 'user HPP', ...parsed.data } });
  res.status(201).json(row);
});

export default router;
