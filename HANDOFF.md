# HANDOFF — lanjutkan pekerjaan Elio HPP di sini

Dokumen ini untuk melanjutkan pekerjaan di mesin lain (mis. MacBook). Riwayat
chat Claude Code TIDAK ikut pindah antar-komputer — konteks dibawa lewat repo
ini + dokumen ini. Di mesin baru: clone repo, buka Claude Code di folder ini,
lalu minta "baca HANDOFF.md".

> Selalu balas dalam Bahasa Indonesia.

## Apa ini
Kalkulator HPP (harga pokok) & harga jual untuk F&B, sudah dimigrasi dari
Supabase/Vercel ke self-host aaPanel. Frontend statis (HTML/JS, tanpa build)
di `app/`, backend Node/Express/Prisma/MySQL di `backend/`. Auth = PIN bersama
+ JWT. Harga bahan dibaca lintas-DB (read-only) dari `elio_cashflow`
(PostgreSQL) di server yang sama — lihat `backend/src/lib/hargaAcuanClient.ts`.

Detail migrasi awal & gotcha server ada di `STATUS_MIGRASI.md`.

## Link penting
- Aplikasi live: https://hpp.eliodigihub.my.id/
- Widget ringkasan (iframe): https://hpp.eliodigihub.my.id/widget.html?token=<WIDGET_TOKEN>
- Repo: https://github.com/iwankapatualang123-sys/elio-hpp-aapanel

## Lokasi di server aaPanel
- Repo git (checkout kode): `/www/wwwroot/elio-hpp-aapanel`
- Docroot yang di-serve ke domain (folder statis TERPISAH): `/www/wwwroot/hpp.eliodigihub.my.id`
- Backend: PM2 proses `elio-hpp-backend` (port 3904, lihat `backend/.env`)
- Nginx extension config: `/www/server/panel/vhost/nginx/extension/hpp.eliodigihub.my.id/hpp-app.conf`
  (sumber di repo: `deploy/nginx-hpp.conf`)

## CARA DEPLOY (WAJIB DIINGAT)
Docroot (`hpp.eliodigihub.my.id`) BUKAN git checkout — file `app/` harus
DISALIN manual ke situ setelah `git pull`. Pola:

**Frontend saja (app.js / index.html / apiClient.js / widget.html):**
```bash
cd /www/wwwroot/elio-hpp-aapanel && git pull && \
cp app/app.js app/index.html app/apiClient.js /www/wwwroot/hpp.eliodigihub.my.id/ && \
chown www:www /www/wwwroot/hpp.eliodigihub.my.id/app.js /www/wwwroot/hpp.eliodigihub.my.id/index.html /www/wwwroot/hpp.eliodigihub.my.id/apiClient.js && \
echo "DEPLOY OK"
```

**Kalau backend berubah (routes/schema):** tambahkan build + restart:
```bash
cd /www/wwwroot/elio-hpp-aapanel/backend && npm run build && pm2 restart elio-hpp-backend
```
Kalau schema Prisma berubah: `npx prisma generate && npx prisma db push` sebelum build.

**Gotcha:** kalau `git pull` gagal fast-forward gara-gara `package-lock.json`
diubah `npm install` di server, jalankan dulu:
`git checkout -- backend/package-lock.json`

## Fitur yang sudah ada (per Agu 2026)
- Produk: tabel per kategori (1 kartu/kategori), kolom HPP / harga rekomendasi /
  harga jual aktual / selisih / margin rekom / margin aktual / markup / update.
  Tombol "+ Tambah", "Update Harga" (recalc massal), "Ekspor PDF". Popup log HPP
  per produk.
- Harga jual aktual di outlet (opsional) terpisah dari harga rekomendasi.
- Modal edit bahan di resep: harga beli, isi per kemasan + **satuan dropdown**
  (gram/kilogram/Ons/Pcs/ML), harga per unit, jumlah dipakai, tombol **Simpan**
  (persist ke material_konversi).
- Halaman **Bahan**: katalog semua material (Gudang/Harian/Manual) + cari/filter,
  tanda ⚠ untuk isi yang janggal, edit & hapus. (Menu sidebar.)
- **Kondimen** (menu sidebar sendiri) & **Pengaturan** (kategori/cabang/log).
- Sidebar navigasi: Dashboard / Produk / Bahan / Kondimen / Pengaturan. Top bar
  = header saja (glass hijau), ukuran konsisten semua tab, layout full-frame.
- Dashboard: KPI, kesehatan margin, produk per kategori, **Tren HPP per kategori**
  (naik=merah/turun=hijau), ringkasan per cabang, paling untung, rugi.
- Refresh HPP otomatis harian jam 03:00 (server, `backend/src/jobs/refreshHarga.ts`)
  + tombol manual. TIDAK menyentuh harga jual aktual.
- **Widget** ringkasan read-only (`/api/widget/summary` + `app/widget.html`),
  diproteksi `WIDGET_TOKEN` (env), untuk di-embed iframe di aplikasi lain.

## Yang MASIH terbuka / perlu tindak lanjut
1. **Widget iframe di aplikasi "gate"**: perlu set `WIDGET_TOKEN` di `backend/.env`
   (server), lalu isi domain penampung di nginx `frame-ancestors`. Domain yang
   disebut user: `gate.eliodigihub.my.id` (user sempat ketik `y.id`, DIASUMSIKAN
   `my.id` — perlu dikonfirmasi). Perintah nginx:
   ```bash
   cd /www/wwwroot/elio-hpp-aapanel && git pull && \
   sed 's|<DOMAIN-PENAMPUNG>|gate.eliodigihub.my.id|' deploy/nginx-hpp.conf > \
   /www/server/panel/vhost/nginx/extension/hpp.eliodigihub.my.id/hpp-app.conf && \
   nginx -t && nginx -s reload && echo "NGINX OK"
   ```
   Iframe (di kode aplikasi gate, BUKAN terminal):
   `<iframe src="https://hpp.eliodigihub.my.id/widget.html?token=TOKENMU" ...>`
2. **Data isi/satuan bahan salah** (bikin HPP meledak). Contoh ditemukan: beans
   (isi 15/18 gr, harusnya berat asli mis. 1000 gr), cup 12oz (isi 355, harusnya
   50 pcs krn 62.400 = harga 50 pcs), LKK Minyak Wijen, Skm, dll. Halaman Bahan
   menandai yang janggal (⚠). User perlu koreksi isi per kemasan tiap bahan.
   Fix kode sudah mencegah HPP salah-hitung (produk/kondimen dgn bahan belum
   lengkap satuan DILEWATI saat Update Harga, tidak dihitung pakai harga mentah).
3. **Kondimen menyimpan salinan satuan sendiri** (kondimen_bahan.isi_kemasan),
   BUKAN baca dari material_konversi bersama. Jadi kalau satuan bahan dibetulkan,
   kondimen yang sudah pakai bahan itu TIDAK ikut terupdate — perlu diedit ulang.
   User pernah menyinggung ingin ini disamakan (opsional, belum dikerjakan).
4. Retire lama: Vercel+Supabase HPP lama belum diputuskan cutover finalnya.
