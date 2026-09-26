import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { clearSession, forgetAdmin, issueSession, requireAdmin } from '../../auth/session.js';
import { prisma } from '../../db.js';
import { HttpError, parse } from '../../lib/http.js';
import { rateLimit } from '../../lib/rateLimit.js';

export const authRouter = Router();

const LoginBody = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

// Хэш для выравнивания времени ответа, когда такого пользователя нет.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

authRouter.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const { username, password } = parse(LoginBody, req.body);
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await dummyHash));
  if (!admin || !ok) throw new HttpError(401, 'Неверный логин или пароль');
  issueSession(res, admin);
  res.json({ username: admin.username });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin!.username });
});

const PasswordBody = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(10, 'Минимум 10 символов').max(200),
});

authRouter.put('/password', requireAdmin, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const { current, next } = parse(PasswordBody, req.body);
  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.admin!.id } });
  if (!(await verifyPassword(current, admin.passwordHash))) throw new HttpError(400, 'Текущий пароль неверен');
  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(next), tokenVersion: { increment: 1 } },
  });
  forgetAdmin(admin.id);
  issueSession(res, updated); // остальные сессии становятся недействительными
  res.status(204).end();
});
