// Jalankan refresh HPP otomatis SEKARANG juga (bukan nunggu jadwal jam 03:00).
// Berguna buat tes hasilnya secara manual sebelum percaya jadwal harian jalan
// sendiri tanpa diawasi, atau kalau suatu saat perlu paksa refresh dari
// terminal tanpa buka aplikasi. Logika yang dipanggil PERSIS sama dengan yang
// dipakai scheduler di server.ts (src/jobs/refreshHarga.ts) — bukan salinan.
import { refreshSemuaHarga } from '../src/jobs/refreshHarga';

refreshSemuaHarga()
  .then((hasil) => {
    console.log('Selesai:', hasil);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Gagal:', err);
    process.exit(1);
  });
