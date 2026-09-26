import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config.js';
import { prisma } from '../db.js';

export const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

interface SessionPayload {
  sub: string;
  ver: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: { id: string; username: string };
  }
}

export function issueSession(res: Response, admin: { id: string; tokenVersion: number }) {
  const payload: SessionPayload = { sub: admin.id, ver: admin.tokenVersion };
  const token = jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: SESSION_TTL_SEC });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SEC * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' });
}

// Небольшой кэш, чтобы не ходить в БД на каждый запрос админки.
const adminCache = new Map<string, { username: string; ver: number; until: number }>();
export const forgetAdmin = (id: string) => adminCache.delete(id);

async function resolveAdmin(req: Request) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) return null;

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as unknown as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;

  let cached = adminCache.get(payload.sub);
  if (!cached || cached.until < Date.now()) {
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin) return null;
    cached = { username: admin.username, ver: admin.tokenVersion, until: Date.now() + 60_000 };
    adminCache.set(admin.id, cached);
  }
  if (cached.ver !== payload.ver) return null;
  return { id: payload.sub, username: cached.username };
}

export const optionalAdmin = resolveAdmin;

/** Пропускает только авторизованного администратора. */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const admin = await resolveAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.admin = admin;
  next();
};

/**
 * Дополнительная защита от CSRF: изменяющие запросы должны приходить
 * с того же origin (cookie и так SameSite=Strict).
 */
export const sameOriginOnly: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = new Set(
    (env.CORS_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  try {
    if (new URL(origin).host === req.get('host') || allowed.has(origin)) return next();
  } catch {
    /* некорректный Origin — отклоняем ниже */
  }
  res.status(403).json({ error: 'Forbidden origin' });
};
