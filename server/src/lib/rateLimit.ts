import type { RequestHandler } from 'express';

interface Options {
  windowMs: number;
  max: number;
}

/**
 * Простой ограничитель частоты запросов в памяти процесса.
 * Для одного инстанса на Railway этого достаточно; при горизонтальном
 * масштабировании его стоит заменить на общее хранилище (например, Redis).
 */
export function rateLimit({ windowMs, max }: Options): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      res.status(429).json({ error: 'Too many requests, try again later' });
      return;
    }
    next();
  };
}
