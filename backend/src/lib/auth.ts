import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Tidak ada tabel users — HPP dari awal cuma satu PIN bersama untuk seluruh
// tim (akun Supabase `hpp@elio.local` yang lama juga cuma satu). Payload JWT
// jadi minimal: tidak ada identitas per-user untuk dikodekan, cuma penanda
// "sudah lolos PIN" + masa berlaku. `sub` tetap disertakan (konvensi JWT
// umum) walau nilainya statis.
export interface JwtPayload {
  sub: 'hpp-shared';
}

export async function verifyPin(plain: string): Promise<boolean> {
  if (!env.hppPinHash) return false;
  return bcrypt.compare(plain, env.hppPinHash);
}

export async function hashPin(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function signToken(): string {
  const payload: JwtPayload = { sub: 'hpp-shared' };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
