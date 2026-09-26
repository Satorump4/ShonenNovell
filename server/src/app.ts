import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env, isProd } from './config.js';
import { prisma } from './db.js';
import { errorHandler } from './lib/http.js';
import { adminRouter } from './routes/admin/index.js';
import { publicRouter } from './routes/public.js';
import { LOCAL_PUBLIC_PATH } from './services/storage/local.js';

const CLIENT_DIR = path.resolve('dist/client');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Railway проксирует запросы — нужен реальный IP клиента для rate limit.
  app.set('trust proxy', 1);

  const s3Origin = env.S3_PUBLIC_URL ? new URL(env.S3_PUBLIC_URL).origin : null;
  const extra = s3Origin ? [s3Origin] : [];

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          mediaSrc: ["'self'", 'blob:', ...extra],
          connectSrc: ["'self'", ...extra],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS нужен только если фронтенд живёт на другом домене (по умолчанию — тот же).
  if (env.CORS_ORIGIN) {
    const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
    app.use('/api', cors({ origin: origins, credentials: true }));
  }

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });
  app.use('/api/admin', adminRouter);
  app.use('/api', publicRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Локальное хранилище медиа (на Railway — примонтированный Volume).
  if (env.STORAGE_TYPE === 'local') {
    app.use(
      LOCAL_PUBLIC_PATH,
      express.static(path.resolve(env.STORAGE_DIR), {
        immutable: true,
        maxAge: '365d',
        index: false,
        dotfiles: 'deny',
        setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
      }),
    );
    app.use(LOCAL_PUBLIC_PATH, (_req, res) => {
      res.status(404).end();
    });
  }

  // Собранный фронтенд (в разработке его отдаёт Vite).
  if (existsSync(path.join(CLIENT_DIR, 'index.html'))) {
    const indexHtml = readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');
    app.use(
      '/assets',
      express.static(path.join(CLIENT_DIR, 'assets'), { immutable: true, maxAge: '365d', index: false }),
    );
    app.use(express.static(CLIENT_DIR, { index: false, maxAge: '1h' }));
    // Название книги подставляется в <title> (превью ссылок, поисковики); кэшируем на минуту.
    let cached: { html: string; until: number } | null = null;
    app.get(/.*/, async (_req, res) => {
      if (!cached || cached.until < Date.now()) {
        const book = await prisma.book.findUnique({ where: { id: 1 }, select: { title: true, description: true } });
        cached = { html: renderIndex(book), until: Date.now() + 60_000 };
      }
      res.set('Cache-Control', 'no-cache').type('html').send(cached.html);
    });
    const renderIndex = (book: { title: string; description: string } | null) =>
      book
        ? indexHtml
            .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(book.title)}</title>`)
            .replace(
              /<meta name="description" content="[^"]*"\s*\/?>/,
              `<meta name="description" content="${escapeHtml(book.description.slice(0, 200))}" />`,
            )
        : indexHtml;
  }

  app.use(errorHandler);
  return app;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
