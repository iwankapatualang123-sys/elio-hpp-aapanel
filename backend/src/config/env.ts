import 'dotenv/config';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const env = {
  // Peta port lain di server aaPanel yang sama (per catatan
  // internal-performence-aapanel, diverifikasi 2026-07-20): 3900=elio-absensi-backend,
  // 3901=dailychecklist-backend, 3902=cashflow-postgrest (docker-proxy),
  // 3903=internal-performence-backend. 3904 kemungkinan besar bebas tapi
  // WAJIB dicek ulang live (`netstat -tlnp` + `pm2 list`) sebelum deploy —
  // catatan ini bisa sudah basi.
  port: parseInt(process.env.PORT || '3904', 10),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  hppPinHash: process.env.HPP_PIN_HASH || '',
  // Kosong = fitur harga acuan nonaktif dengan graceful degradation
  // (lihat lib/hargaAcuanClient.ts), bukan error keras — berguna saat dev
  // lokal tanpa akses ke Supabase Elio Cashier.
  hargaAcuanDatabaseUrl: process.env.HARGA_ACUAN_DATABASE_URL || ''
};
