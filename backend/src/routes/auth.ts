import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { verifyPin, signToken } from '../lib/auth';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Supabase GoTrue rate-limited sign-in attempts automatically. A hand-rolled
// login endpoint gets none of that for free — and a 4-digit PIN is only
// 10,000 combinations, so this is required, not a nice-to-have follow-up.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }
});

const loginSchema = z.object({ pin: z.string().min(1) });

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'PIN tidak valid.' });

  const ok = await verifyPin(parsed.data.pin);
  if (!ok) return res.status(401).json({ error: 'PIN salah.' });

  res.json({ token: signToken() });
});

// Dipakai frontend menggantikan sb.auth.getSession() — sekadar konfirmasi
// token yang tersimpan masih sah, tidak ada data sesi lain untuk dikirim.
router.get('/me', requireAuth, (_req, res) => res.json({ ok: true }));

export default router;
