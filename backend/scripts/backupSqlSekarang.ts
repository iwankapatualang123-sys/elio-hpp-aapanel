// Membuat satu dump SQL (.sql.gz) -- SAMA PERSIS dengan tombol "Buat & unduh
// SQL" di aplikasi (lib/backupSql.ts) -- lalu mencetak PATH file hasilnya ke
// stdout. Dipakai oleh skrip cron offsite (/root/backup-elio-hpp-ke-drive.sh)
// untuk mengambil file itu dan menyalinnya ke Google Drive (polos, keputusan
// pemilik 16 Nov 2026). Semua pesan selain path ditulis ke stderr supaya stdout
// bersih berisi satu baris path saja.
//
// Jalankan dari folder backend:
//   npx tsx scripts/backupSqlSekarang.ts
import { buatBackupSql } from '../src/lib/backupSql';

buatBackupSql()
  .then((b) => { process.stdout.write(b.path + '\n'); process.exit(0); })
  .catch((e) => { process.stderr.write('backup-sql gagal: ' + (e?.message || String(e)) + '\n'); process.exit(1); });
