# Proyek: Migrasi Elio HPP dari Supabase ke Self-Host aaPanel

## Ringkasan

Aplikasi "HPP Elio" (kalkulator harga pokok & harga jual FNB) awalnya 100% berjalan di atas
**Supabase** (Postgres + Auth PIN + API otomatis), di-deploy ke **Vercel**. Sedang dimigrasi ke
**backend custom Node.js + MySQL**, self-host di server **aaPanel** milik user — mengikuti pola
yang sama persis dengan migrasi "Elio Absensi" dan "Internal Performance" (lihat
`internal-performence-aapanel/backend` sebagai referensi struktur, sudah dicek langsung).

**Prinsip yang dipegang sepanjang migrasi ini: repo/deployment Vercel yang lama (`Elio_HPP`,
folder `C:\Users\NTHA\Documents\GitHub\Elio_HPP`) TIDAK PERNAH disentuh.** Domain
`hpp.eliodigihub.my.id` sendiri **sudah live** melayani file statis versi lama (upload manual
~13 Jul, masih connect ke Supabase) — itu tetap jalan apa adanya sampai ada keputusan cutover
eksplisit dari user.

## Status saat ini: kode backend+frontend selesai & lolos verifikasi lokal — BELUM PERNAH disentuh ke server sungguhan

- [x] **Backend Node.js+Express+Prisma+MySQL** — skema 11 tabel, semua route CRUD, auth JWT PIN
  bersama, baca lintas-DB ke `harga_acuan_material`. **Lolos verifikasi lokal**: `npx prisma
  generate` sukses (skema valid), `npx tsc --noEmit` nol error (src/ dan scripts/), server
  benar-benar di-boot lokal dan `GET /api/health` membalas `{"ok":true}` (pakai DATABASE_URL
  palsu — belum pernah nyambung ke MySQL sungguhan). **Belum pernah** diuji dengan database asli
  atau data sungguhan.
- [x] **apiClient.js (shim query-builder, bukan sekadar wrapper fungsi)** — pengganti
  `@supabase/supabase-js`. **`app.js` dan `index.html` TIDAK diubah sama sekali** dari versi lama
  (beda dari pola Internal Performance yang tetap perlu ganti satu baris import) — apiClient.js
  mendefinisikan `window.supabase.createClient()` yang mengembalikan objek tiruan dengan
  permukaan `.auth.*` dan `.from(table).select().eq()...` yang sama persis, diterjemahkan ke
  fetch ke backend baru. Setiap dari ~40 bentuk pemanggilan Supabase di app.js sudah dipetakan
  satu-per-satu (lihat komentar di `app/apiClient.js`), bukan generic proxy.
- [ ] **Provisioning database MySQL di server** — user sudah bikin database `sql_hpp_eliodigihub_my_id`
  lewat aaPanel Database Manager (kosong, belum ada tabel) — `prisma db push` **belum pernah dijalankan**.
- [ ] Migrasi data asli dari Supabase (`Elio Cashier`, project `gwdtovpflrkkuvllexrv`) ke MySQL — **belum pernah dijalankan**.
- [ ] Backend jalan di server via PM2 — **belum pernah di-deploy ke server**.
- [ ] Nginx reverse-proxy `/api/*` di domain `hpp.eliodigihub.my.id` — **belum dipasang**.
- [ ] Cutover frontend (timpa `/www/wwwroot/hpp.eliodigihub.my.id` dengan build baru) — **belum dilakukan**.

**Estimasi realistis untuk sisanya**: provisioning server, migrasi data asli, deploy, dan QA
menyeluruh — sama seperti migrasi-migrasi sebelumnya, ini butuh sesi kerja interaktif dengan
akses SSH user ke server aaPanel (Claude tidak punya akses langsung).

## Arsitektur

**Repo lama `Elio_HPP`** (lokal: `C:\Users\NTHA\Documents\GitHub\Elio_HPP` — JANGAN DIUBAH tanpa diminta eksplisit):
- Deploy Vercel (kalau masih ada) + domain `hpp.eliodigihub.my.id` (nginx, SSL aktif) — **keduanya masih pakai Supabase, PRODUKSI AKTIF**.

**Repo baru `elio-hpp-aapanel`** (lokal: `C:\Users\NTHA\Documents\GitHub\elio-hpp-aapanel`, **belum di-push ke GitHub**):
- `backend/` — Node.js + Express + Prisma + MySQL. Struktur (identik konvensi `internal-performence-aapanel/backend`):
  - `prisma/schema.prisma` — 11 model: Produk, ResepBahan, BiayaOperasionalProduk, ProdukHppHistory,
    ProdukLog, KategoriProduk, CabangHpp, MaterialKonversi, MaterialManual, Kondimen, KondimenBahan.
    `harga_acuan_material` SENGAJA tidak ada di sini — itu dibaca live cross-DB (lihat di bawah).
  - `src/routes/*.ts` — satu file per resource, `requireAuth` di semua kecuali `/api/health`.
  - `src/lib/auth.ts` — PIN bersama (bcrypt) + JWT, TANPA tabel users (beda dari Absensi/Internal
    Performance yang multi-user — HPP dari awal cuma satu PIN untuk semua).
  - `src/lib/hargaAcuanClient.ts` — baca `harga_acuan_material` cross-DB, lihat bagian tersendiri di bawah.
  - `src/middleware/authMiddleware.ts` — `requireAuth` saja (tidak ada `requireRole`, cuma satu kelas user).
  - `scripts/migrateFromSupabase.ts` — migrasi data 11 tabel, idempotent (upsert by id), urut sesuai dependency FK.
  - `scripts/setPin.ts` — interaktif, cetak hash PIN untuk ditempel manual ke `.env` (tidak menulis file sendiri).
- `app/` — `index.html` & `app.js` **byte-identik** dengan repo lama, `config.js` disederhanakan (tanpa
  kunci Supabase asli), `apiClient.js` baru (lihat di atas).
- `deploy/nginx-hpp.conf` — template config Nginx untuk proxy `/api/*`.

## Baca lintas-app: `harga_acuan_material`

HPP tidak generate harga acuan bahan sendiri — datanya berasal dari histori pembelian di sisi
Cashier/Cashflow (BACA-INI.md lama: "gabungan belanja gudang + belanja harian"), yang tinggal di
project Supabase **yang sama persis** dengan Elio Cashflow (`gwdtovpflrkkuvllexrv`) — dikonfirmasi
dari `config.js` HPP lama dan `elio-cashflow-aapanel/SETUP_AAPANEL.md` menunjuk project Supabase
yang identik.

Cashflow sendiri sedang dimigrasi ke PostgreSQL+PostgREST self-host (database `elio_cashflow` di
server yang sama) — **tapi belum cutover, masih WIP aktif**. Migrasi HPP ini **tidak digantung**
ke jadwal Cashflow:

- **Fase 1 (sekarang)**: `HARGA_ACUAN_DATABASE_URL` di `backend/.env` mengarah ke project Supabase
  **asli** (`gwdtovpflrkkuvllexrv`), pakai role Postgres baru yang cuma di-`GRANT SELECT` ke
  `harga_acuan_material` — lewat **pooler/transaction-mode connection string** (port 6543 di
  Supabase), BUKAN direct connection (project itu masih melayani trafik Vercel produksi asli,
  jangan rebutan slot koneksi direct). `src/lib/hargaAcuanClient.ts` cache in-memory 45 detik +
  degradasi elegan (kalau koneksi gagal, endpoint produk tetap jalan, bahan "acuan" ditandai tidak
  tersedia — tidak meng-crash seluruh halaman).
- **Fase 2 (nanti, setelah Cashflow benar-benar live produksi — bukan cuma migrasi skema
  selesai)**: ganti `HARGA_ACUAN_DATABASE_URL` ke connection string `elio_cashflow` di server
  sendiri. Target koneksi cuma dibaca dari satu env var di satu modul, jadi swap ini ganti
  config, bukan redesign.
- **Belum diverifikasi** (perlu akses dashboard Supabase project Elio Cashier — saya tidak punya):
  apakah `harga_acuan_material` tabel biasa atau VIEW live di atas tabel pembelian mentah. Cek di
  Supabase SQL Editor: `select table_type from information_schema.tables where table_name =
  'harga_acuan_material';` — kalau VIEW, catat definisinya (`\d+ harga_acuan_material` atau tab
  "Definition" di Table Editor), itu menentukan apa yang perlu direplikasi di `elio_cashflow`
  sebelum Fase 2 valid.

## Keputusan teknis penting

1. **Auth jadi PIN bersama (bukan multi-user)** — HPP dari awal cuma satu akun Supabase
   (`hpp@elio.local`), jadi tidak ada tabel `users` sama sekali di backend baru, cuma
   `HPP_PIN_HASH` (bcrypt) di `.env`. Ini LEBIH SEDERHANA dari pola Absensi/Internal Performance,
   bukan penyederhanaan yang mengurangi fitur — perilaku lama memang cuma satu PIN bersama.
2. **Rate limiting di `/api/auth/login` wajib ada sejak awal** (`express-rate-limit`, ~8
   percobaan/15 menit per IP) — Supabase GoTrue otomatis membatasi percobaan login, endpoint
   custom tidak dapat itu gratis, dan PIN 4 digit cuma 10.000 kombinasi.
3. **`app.js` tidak diubah sama sekali** (lihat apiClient.js di atas) — beda dari pola 3 migrasi
   sebelumnya yang tetap perlu satu baris import diganti. Konsekuensinya: kalau app.js
   di-`git pull` dari repo `Elio_HPP` lama di masa depan (mis. ada perbaikan bug UI di sana),
   fitur BARU yang menambah pola pemanggilan Supabase baru **tidak otomatis didukung** —
   `apiClient.js`nya perlu ditambah manual (lihat komentar di file itu, ini bukan generic proxy).
4. **`resep_bahan`/`biaya_operasional_produk`/`kondimen_bahan`: delete lalu insert dari app.js
   lama dipetakan ke SATU endpoint `/replace`** (delete+insert dalam satu transaksi Prisma) di
   backend, dipanggil DUA KALI berurutan oleh shim untuk kasus umum (sekali dengan rows kosong dari
   panggilan `.delete()`, sekali lagi dengan rows asli dari panggilan `.insert()`) — sedikit boros
   (2 request, bukan 1) tapi BENAR untuk semua kasus termasuk biaya operasional yang boleh
   dikosongkan total (kalau shim cuma no-op di `.delete()` dan mengandalkan `.insert()`, kasus
   "hapus semua baris opex lalu simpan" akan gagal senyap karena `.insert()` tidak pernah
   dipanggil saat array-nya kosong).
5. **`kondimen_bahan` kolomnya BUKAN tebakan** — sempat saya asumsikan mirip `resep_bahan` sebelum
   baca detail `simpanKondimen()` di app.js; ternyata ada `bahan_nama` (snapshot nama tampilan),
   `isi_kemasan` & `satuan` (snapshot konversi per baris) yang tidak ada di `resep_bahan`. Sudah
   diperbaiki di schema.prisma & routes sebelum sempat jadi masalah migrasi data.
6. **Prisma Decimal ter-serialize sebagai STRING lewat JSON** (bukan number) — beberapa titik di
   app.js (mis. `kondimen.hpp_per_satuan.toFixed(2)`) manggil method Number langsung tanpa
   `Number()` pembungkus. `apiClient.js` otomatis meng-konversi balik string angka murni ke Number
   di setiap response (regex ketat, tidak menyentuh UUID/timestamp ISO) — supaya app.js tidak
   perlu tahu soal ini sama sekali.

## Verifikasi yang SUDAH dilakukan (lokal, sebelum sentuh server)

```
cd backend
npm install                          # sukses, 141 package
npx prisma generate                  # sukses -- schema.prisma valid
npx tsc --noEmit -p tsconfig.json    # nol error, src/ lengkap
npx tsc --noEmit scripts/*.ts ...    # nol error, scripts/ lengkap
npx tsx src/server.ts                # boot sukses (DATABASE_URL palsu),
                                      # GET /api/health -> 200 {"ok":true}
```
**Belum diuji sama sekali**: koneksi ke MySQL sungguhan, migrasi data asli, endpoint apa pun yang
menyentuh Prisma/database (semuanya akan gagal terhubung ke DB palsu di atas — itu memang tujuan
smoke test ini, cuma memastikan Express+route wiring tidak salah, bukan logic query-nya).

## Langkah selanjutnya — server aaPanel (butuh terminal SSH user, Claude tidak punya akses)

Jalankan **satu perintah per satu waktu**, jangan tempel blok besar sekaligus (pelajaran dari
insiden paste korup di migrasi-migrasi sebelumnya).

### Fase 0 — Verifikasi (WAJIB sebelum apa pun, jangan percaya catatan port di bawah tanpa dicek ulang)
```
pm2 list
netstat -tlnp
ls -la /www/wwwroot/
```
Peta port yang tercatat di `internal-performence-aapanel` per 2026-07-20: 3900=elio-absensi-backend,
3901=dailychecklist-backend, 3902=cashflow-postgrest (docker-proxy), 3903=internal-performence-backend.
`backend/.env.example` di repo ini sudah default ke **3904** — cek ulang benar-benar bebas sebelum dipakai.

Cek juga docroot asli domain: `ls -la /www/wwwroot/hpp.eliodigihub.my.id` (harusnya berisi
index.html/app.js/config.js versi lama saat ini).

### Fase 1 — Skema live Supabase (lewat dashboard, bukan terminal server)
Buka Supabase Dashboard project **Elio Cashier** → Table Editor / SQL Editor, cek:
- Tipe primary key tiap tabel (UUID string vs lainnya), nullability `produk.kategori_id`/`cabang_hpp_id`.
- `harga_acuan_material`: tabel atau view? (lihat bagian "Baca lintas-app" di atas)
- Kalau ada perbedaan dari `prisma/schema.prisma`, edit skema DULU sebelum `db push` ke data produksi.

### Fase 2 — Clone & provisioning
```
cd /www/wwwroot
git clone <url-repo-elio-hpp-aapanel> elio-hpp-aapanel
cd elio-hpp-aapanel/backend
cp .env.example .env
```
Isi `.env` langsung di server (JANGAN lewat chat): `DATABASE_URL` (MySQL `sql_hpp_eliodigihub_my_id`,
kredensial dari aaPanel Database Manager), `JWT_SECRET` (`openssl rand -base64 48`), `PORT` (hasil
verifikasi Fase 0), `HARGA_ACUAN_DATABASE_URL` (pooler connection string Supabase, role read-only baru).

```
npm install
npx prisma db push
npm run set-pin       # interaktif, tempel hash yang dicetak ke HPP_PIN_HASH di .env
```

### Fase 3 — Migrasi data (konfirmasi eksplisit dulu — kontak pertama ke data produksi Supabase asli)
Isi juga di `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (dari Supabase Dashboard project
Elio Cashier → Settings → API — service_role, BUKAN publishable/anon).
```
npm run migrate:from-supabase
```
Cek jumlah baris per tabel di output vs Supabase Table Editor, dan sampel nilai
`hpp_terakhir`/`harga_jual_disarankan` (jaga-jaga presisi Decimal terpotong).

### Fase 4 — PM2 + Nginx
```
npm run build
pm2 start ecosystem.config.js
pm2 save
curl http://127.0.0.1:<PORT>/api/health
```
```
mkdir -p /www/server/panel/vhost/nginx/extension/hpp.eliodigihub.my.id
cp /www/wwwroot/elio-hpp-aapanel/deploy/nginx-hpp.conf /www/server/panel/vhost/nginx/extension/hpp.eliodigihub.my.id/hpp-app.conf
```
Edit port di file itu kalau bukan 3904. Lalu:
```
nginx -t
nginx -s reload
curl https://hpp.eliodigihub.my.id/api/health
```

### Fase 5 — Cutover frontend (backup dulu — domain ini SUDAH LIVE, tidak ada domain cadangan seperti migrasi-migrasi sebelumnya)
```
tar -czf /root/backup_hpp_eliodigihub_$(date +%Y%m%d_%H%M%S).tar.gz -C /www/wwwroot/hpp.eliodigihub.my.id .
cp /www/wwwroot/elio-hpp-aapanel/app/*.html /www/wwwroot/elio-hpp-aapanel/app/*.js /www/wwwroot/hpp.eliodigihub.my.id/
chown -R www:www /www/wwwroot/hpp.eliodigihub.my.id
```
Uji di browser (incognito): login PIN, daftar produk, tambah/edit produk (cek resep, biaya
operasional, riwayat HPP, log tersimpan), kategori, kondimen, cabang, dan KHUSUSNYA alur harga
acuan bahan (satu-satunya jalur yang menyentuh database kedua) — bandingkan angka dengan versi
Supabase lama untuk data yang sama.

## Cara deploy ulang (kalau ada perubahan kode setelah live)

**Backend** (dari `/www/wwwroot/elio-hpp-aapanel/backend`):
```
git pull && npx prisma generate && npm run build && pm2 restart elio-hpp-backend
```
⚠️ Kalau folder backend PERNAH dipindah, `pm2 restart` tidak cukup — `pm2 delete elio-hpp-backend`
lalu `pm2 start ecosystem.config.js` dari folder yang benar, baru `pm2 save` (pelajaran dari
insiden yang sama di migrasi Absensi).

**Frontend**: `cp app/*.html app/*.js /www/wwwroot/hpp.eliodigihub.my.id/` — tidak ada build step
(HPP tetap static murni, seperti versi Supabase-nya).

## Instruksi untuk Claude yang melanjutkan dari sini

- **JANGAN ubah apa pun di repo `Elio_HPP` (folder `C:\Users\NTHA\Documents\GitHub\Elio_HPP`)**
  atau deployment Vercel-nya tanpa user memintanya secara eksplisit.
- Semua pekerjaan lanjutan dikerjakan di repo **`elio-hpp-aapanel`** (folder terpisah).
- Server aaPanel diakses lewat **terminal/SSH milik user** — Claude TIDAK punya akses langsung.
  Beri instruksi command satu-per-satu, minta user paste hasilnya, baru lanjut.
- **Jangan pernah minta atau proses password/token/connection-string asli lewat chat.** Arahkan
  user menempelkannya langsung ke `.env` di server.
- Sebelum menjalankan `migrate:from-supabase` (atau apa pun yang menyentuh Supabase produksi
  asli), konfirmasi dulu ke user.
- Kalau ragu soal state server (proses PM2 mana aktif, port mana terpakai, apakah `db push` sudah
  jalan), verifikasi dulu lewat command langsung — dokumen ini bisa basi begitu server benar-benar
  disentuh.
- Server aaPanel yang sama menghost banyak app lain (absensi, cashflow, dailychecklist,
  internal-performance) — SELALU `ls -la /www/wwwroot/` dan `pm2 list` dulu sebelum membuat apa
  pun, jangan asumsikan resource kosong.
- Kalau `harga_acuan_material` di Supabase ternyata VIEW (bukan tabel), catat definisinya di sini
  sebelum Fase 2 (swap ke `elio_cashflow`) dikerjakan — lihat bagian "Baca lintas-app" di atas.
