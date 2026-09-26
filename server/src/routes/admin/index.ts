import { Router } from 'express';
import { requireAdmin, sameOriginOnly } from '../../auth/session.js';
import { authRouter } from './auth.js';
import { bookRouter } from './book.js';
import { chaptersRouter } from './chapters.js';
import { mediaRouter } from './media.js';
import { scenesRouter } from './scenes.js';

export const adminRouter = Router();

adminRouter.use(sameOriginOnly);
adminRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// login/logout/me — сами решают, нужна ли авторизация.
adminRouter.use('/', authRouter);

// Всё остальное — только для администратора.
adminRouter.use(requireAdmin);
adminRouter.use('/book', bookRouter);
adminRouter.use('/chapters', chaptersRouter);
adminRouter.use('/scenes', scenesRouter);
adminRouter.use('/media', mediaRouter);
