import { spawn } from 'child_process';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { env } from '../config/env';
import { FOLDER, buatCadangan, terimaKeadaanSekarang } from './cadangan';

// Backup & restore format SQL (mysqldump / mysql client) -- pelengkap cadangan
// JSON. File .sql.gz disimpan di FOLDER yang sama dengan cadangan JSON (pola
// nama beda, jadi daftar JSON & SQL tidak saling tercampur). SQL cocok untuk
// restore penuh standar (mysql < file) dan pindah server; JSON tetap jadi
// cadangan harian otomatis + alarm "data mundur".

const POLA_SQL = /^hpp-\d{8}-\d{6}\.sql\.gz$/;
const SIMPAN_SQL = 10; // simpan 10 file SQL terbaru (rotasi)

function cap(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
export function namaFileSql(d = new Date()): string { return `hpp-${cap(d)}.sql.gz`; }

function parseDbUrl() {
  const u = new URL(env.databaseUrl);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port || '3306',
    user: decodeURIComponent(u.username || 'root'),
    password: decodeURIComponent(u.password || ''),
    database: u.pathname.replace(/^\//, '').split('?')[0] || ''
  };
}

function cariBiner(nama: 'mysqldump' | 'mysql'): string {
  if (nama === 'mysqldump' && env.mysqldumpPath) return env.mysqldumpPath;
  if (nama === 'mysql' && env.mysqlPath) return env.mysqlPath;
  const kandidat = [`/www/server/mysql/bin/${nama}`, `/usr/bin/${nama}`, `/usr/local/bin/${nama}`];
  for (const c of kandidat) { try { if (fs.existsSync(c)) return c; } catch { /* abaikan */ } }
  return nama; // andalkan PATH
}

export function daftarBackupSql() {
  try {
    return fs.readdirSync(FOLDER)
      .filter((n) => POLA_SQL.test(n))
      .map((n) => { const st = fs.statSync(path.join(FOLDER, n)); return { nama: n, ukuran: st.size, waktu: st.mtime.toISOString() }; })
      .sort((a, b) => b.waktu.localeCompare(a.waktu));
  } catch { return []; }
}

export function pathBackupSql(nama: string): string | null {
  if (!POLA_SQL.test(nama)) return null; // cegah path traversal
  const p = path.join(FOLDER, nama);
  return fs.existsSync(p) ? p : null;
}

export async function buatBackupSql(): Promise<{ nama: string; path: string; ukuran: number }> {
  const db = parseDbUrl();
  if (!db.database) throw new Error('Nama database tidak terbaca dari DATABASE_URL.');
  fs.mkdirSync(FOLDER, { recursive: true });
  const nama = namaFileSql();
  const full = path.join(FOLDER, nama);
  const tmp = full + '.tmp';
  const bin = cariBiner('mysqldump');
  const args = [
    '-h', db.host, '-P', String(db.port), '-u', db.user,
    '--single-transaction', '--quick', '--default-character-set=utf8mb4',
    '--routines', '--events', db.database
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: db.password } });
    const gz = zlib.createGzip();
    const out = fs.createWriteStream(tmp);
    let stderr = '';
    let code: number | null = null;
    let fin = false;
    let done = false;
    const gagal = (e: Error) => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* abaikan */ }
      try { out.destroy(); } catch { /* abaikan */ }
      fs.promises.unlink(tmp).catch(() => { /* abaikan */ });
      reject(e);
    };
    const coba = () => {
      if (done || code === null || !fin) return;
      if (code === 0) { done = true; resolve(); }
      else gagal(new Error(`mysqldump gagal (exit ${code}): ${stderr.trim().slice(0, 400) || 'tidak ada detail error'}`));
    };
    child.on('error', (e) => gagal(new Error(`Tidak bisa menjalankan mysqldump (${bin}): ${e.message}. Set MYSQLDUMP_PATH di backend/.env.`)));
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
    gz.on('error', gagal);
    out.on('error', gagal);
    child.stdout.pipe(gz).pipe(out);
    child.on('close', (c) => { code = c ?? 1; coba(); });
    out.on('finish', () => { fin = true; coba(); });
  });

  fs.renameSync(tmp, full);
  const ukuran = fs.statSync(full).size;
  daftarBackupSql().slice(SIMPAN_SQL).forEach((c) => { try { fs.unlinkSync(path.join(FOLDER, c.nama)); } catch { /* abaikan */ } });
  return { nama, path: full, ukuran };
}

function jalankanRestoreSql(sumber: NodeJS.ReadableStream): Promise<void> {
  const db = parseDbUrl();
  if (!db.database) return Promise.reject(new Error('Nama database tidak terbaca dari DATABASE_URL.'));
  const bin = cariBiner('mysql');
  const args = ['-h', db.host, '-P', String(db.port), '-u', db.user, '--default-character-set=utf8mb4', db.database];
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: db.password } });
    let stderr = '';
    let done = false;
    const gagal = (e: Error) => { if (done) return; done = true; reject(e); };
    child.on('error', (e) => gagal(new Error(`Tidak bisa menjalankan mysql (${bin}): ${e.message}. Set MYSQL_PATH di backend/.env.`)));
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
    child.on('close', (code) => {
      if (done) return;
      if (code === 0) { done = true; resolve(); }
      else gagal(new Error(`mysql gagal (exit ${code}): ${stderr.trim().slice(0, 400) || 'tidak ada detail error'}`));
    });
    sumber.on('error', gagal);
    if (child.stdin) { child.stdin.on('error', gagal); sumber.pipe(child.stdin); }
    else gagal(new Error('stdin mysql tidak tersedia.'));
  });
}

// Pemulihan dari file .sql.gz di server. Membuat cadangan JSON 'sebelum-pulih'
// dulu, lalu menjalankan isi dump ke mysql (menimpa tabel-tabelnya).
export async function pulihkanDariSqlPath(p: string): Promise<{ sebelumPulih: string }> {
  const aman = await buatCadangan('sebelum-pulih');
  const gun = zlib.createGunzip();
  fs.createReadStream(p).on('error', () => { /* ditangani lewat gun/child */ }).pipe(gun);
  await jalankanRestoreSql(gun);
  await terimaKeadaanSekarang();
  return { sebelumPulih: aman.nama };
}

// Pemulihan dari berkas .sql.gz yang DIUNGGAH user (buffer gzip). Untuk kasus
// server kehilangan backup-nya & satu-satunya salinan ada di komputer user.
export async function pulihkanDariSqlGzBuffer(gzBuf: Buffer): Promise<{ sebelumPulih: string }> {
  const aman = await buatCadangan('sebelum-pulih');
  const gun = zlib.createGunzip();
  Readable.from(gzBuf).pipe(gun);
  await jalankanRestoreSql(gun);
  await terimaKeadaanSekarang();
  return { sebelumPulih: aman.nama };
}
