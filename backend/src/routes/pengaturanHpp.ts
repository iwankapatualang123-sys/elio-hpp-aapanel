import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/authMiddleware';
import { terapkanPengaturan } from '../jobs/refreshHarga';

// Pengaturan HPP per cabang/kategori. Lihat src/lib/pengaturanHpp.ts.
const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.pengaturanHpp.findMany({
    include: { biaya: { orderBy: { label: 'asc' } } },
    orderBy: [{ cabangHppId: 'asc' }, { kategoriId: 'asc' }]
  });
  res.json(rows);
});

const biayaSchema = z.object({
  label: z.string().min(1),
  mode: z.enum(['manual', 'persen']),
  value: z.number(),
  aktif: z.boolean()
});
const barisSchema = z.object({
  cabangHppId: z.string().nullable(),
  kategoriId: z.string().nullable(),
  marginPersen: z.number().min(0).max(99.9),
  overheadPersen: z.number().min(0).max(1000),
  biaya: z.array(biayaSchema)
});
const simpanSchema = z.object({ baris: z.array(barisSchema) });

// Simpan SELURUH daftar pengaturan sekaligus (ganti total), lalu langsung
// terapkan ke semua produk. Dibuat "ganti total" supaya urusan tambah/ubah/
// hapus baris jadi satu transaksi -- tidak ada keadaan setengah jadi di mana
// sebagian produk memakai aturan lama dan sebagian aturan baru.
router.post('/', async (req, res) => {
  const parsed = simpanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data pengaturan tidak valid.' });
  const { baris } = parsed.data;

  // Pasangan (cabang, kategori) harus unik -- tidak bisa diserahkan ke unique
  // index karena di MySQL beberapa baris NULL dianggap berbeda.
  const kunci = baris.map((b) => `${b.cabangHppId || '-'}|${b.kategoriId || '-'}`);
  if (new Set(kunci).size !== kunci.length) {
    return res.status(400).json({ error: 'Ada dua pengaturan untuk cabang & kategori yang sama.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.pengaturanBiaya.deleteMany({});
    await tx.pengaturanHpp.deleteMany({});
    for (const b of baris) {
      const id = crypto.randomUUID();
      await tx.pengaturanHpp.create({
        data: {
          id,
          cabangHppId: b.cabangHppId,
          kategoriId: b.kategoriId,
          marginPersen: b.marginPersen,
          overheadPersen: b.overheadPersen,
          biaya: {
            create: b.biaya
              .filter((x) => x.label.trim())
              .map((x) => ({ id: crypto.randomUUID(), label: x.label.trim(), mode: x.mode, value: x.value, aktif: x.aktif }))
          }
        }
      });
    }
  });

  const hasil = await terapkanPengaturan('user HPP');
  res.json({ ok: true, ...hasil });
});

export default router;
