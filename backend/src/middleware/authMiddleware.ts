import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/auth';

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

// Requires a valid Bearer token. Equivalent to Supabase's "authenticated" role check.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan.' });
  }
  try {
    req.user = verifyToken(header.slice('Bearer '.length));
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa.' });
  }
}
