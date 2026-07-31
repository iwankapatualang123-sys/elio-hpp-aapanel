import { Router } from 'express';
import { prisma } from '../db/prisma';
import { env } from '../config/env';

// Endpoint ringkasan read-only untuk widget iframe di aplikasi lain.
// TIDAK pakai requireAuth (tanpa login PIN) -- diproteksi token sederhana di
// query. Kunci ini cuma menutup akses casual; pembatasan "hanya superadmin/
// admin" dilakukan di aplikasi penampung (yang cuma me-render iframe ini untuk
// role tsb). Cuma expose angka agregat, bukan detail resep/harga bahan.
const router = Router();

router.get('/summary', async (req, res) => {
  if (!env.widgetToken) return res.status(403).json({ error: 'Widget dinonaktifkan (WIDGET_TOKEN belum diset).' });
  if (req.query.token !== env.widgetToken) return res.status(403).json({ error: 'Token tidak valid.' });

  const produk = await prisma.produk.findMany({ where: { isDeleted: false, jenis: 'fnb' } });
  const total = produk.length;
  const terisi = produk.filter((p) => Number(p.hppTerakhir) > 0);
  const belum = total - terisi.length;

  let sehat = 0, tipis = 0, rugi = 0;
  const margins: number[] = [];
  terisi.forEach((p) => {
    const hpp = Number(p.hppTerakhir);
    const harga = Number(p.hargaJualDisarankan);
    if (harga <= 0) return;
    const m = ((harga - hpp) / harga) * 100; // margin basis harga jual (sama seperti frontend)
    margins.push(m);
    if (m < 0) rugi++;
    else if (m < 50) tipis++;
    else sehat++;
  });
  const avgMargin = margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0;

  const laba = (p: (typeof terisi)[number]) => Number(p.hargaJualDisarankan) - Number(p.hppTerakhir);
  const untung = terisi.length ? [...terisi].sort((a, b) => laba(b) - laba(a))[0] : null;
  const mahal = terisi.length ? [...terisi].sort((a, b) => Number(b.hppTerakhir) - Number(a.hppTerakhir))[0] : null;

  res.json({
    total,
    terisi: terisi.length,
    belum,
    avgMargin,
    sehat,
    tipis,
    rugi,
    palingUntung: untung ? { nama: untung.nama, laba: Math.round(laba(untung)) } : null,
    hppTertinggi: mahal ? { nama: mahal.nama, hpp: Math.round(Number(mahal.hppTerakhir)) } : null,
    updatedAt: new Date().toISOString()
  });
});

export default router;
