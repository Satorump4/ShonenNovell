import { Router } from 'express';
import { z } from 'zod';
import type { BookDTO, InfoItem, SearchResultDTO } from '../../../shared/types.js';
import { prisma } from '../db.js';
import { notFound, parse } from '../lib/http.js';
import { rateLimit } from '../lib/rateLimit.js';
import { chapterLabel, loadChapter, toSummaryDTO } from '../services/chapters.js';
import { slugify } from '../services/slug.js';

export const publicRouter = Router();

// Публичные данные можно ненадолго кэшировать в браузере.
const shortCache = (maxAge: number) => `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 4}`;

export async function loadBookDTO(): Promise<BookDTO> {
  const [book, chapterCount, rating] = await Promise.all([
    prisma.book.findUnique({ where: { id: 1 }, include: { cover: true, favicon: true } }),
    prisma.chapter.count({ where: { published: true } }),
    prisma.rating.aggregate({ _avg: { value: true }, _count: true }),
  ]);
  if (!book) throw notFound('Book is not configured');
  return {
    title: book.title,
    originalTitle: book.originalTitle,
    author: book.author,
    description: book.description,
    info: (Array.isArray(book.info) ? book.info : []) as unknown as InfoItem[],
    coverUrl: book.cover?.url ?? null,
    faviconUrl: book.favicon?.url ?? null,
    defaultBackground: book.defaultBackground,
    chapterCount,
    rating: {
      average: rating._avg.value != null ? Math.round(rating._avg.value * 100) / 100 : null,
      count: rating._count,
    },
  };
}

publicRouter.get('/book', async (_req, res) => {
  res.set('Cache-Control', shortCache(30)).json(await loadBookDTO());
});

publicRouter.get('/chapters', async (_req, res) => {
  const chapters = await prisma.chapter.findMany({ where: { published: true }, orderBy: { order: 'asc' } });
  res.set('Cache-Control', shortCache(30)).json(chapters.map(toSummaryDTO));
});

publicRouter.get('/chapters/:slug', async (req, res) => {
  const chapter = await loadChapter({ slug: String(req.params.slug) }, true);
  if (!chapter) throw notFound('Chapter not found');
  res.set('Cache-Control', shortCache(30)).json(chapter);
});

const SearchQuery = z.object({ q: z.string().trim().min(2).max(100) });

publicRouter.get('/search', async (req, res) => {
  const { q } = parse(SearchQuery, req.query);
  const scenes = await prisma.scene.findMany({
    where: { chapter: { published: true }, plainText: { contains: q, mode: 'insensitive' } },
    select: { plainText: true, chapter: { select: { id: true, slug: true, title: true, volume: true, number: true, order: true } } },
    orderBy: [{ chapter: { order: 'asc' } }, { order: 'asc' }],
    take: 60,
  });
  const byTitle = await prisma.chapter.findMany({
    where: { published: true, title: { contains: q, mode: 'insensitive' } },
    select: { id: true, slug: true, title: true, volume: true, number: true, order: true },
    orderBy: { order: 'asc' },
    take: 20,
  });

  const results = new Map<string, SearchResultDTO & { order: number }>();
  for (const c of byTitle) {
    results.set(c.id, { chapter: c, snippet: '', order: c.order });
  }
  for (const s of scenes) {
    const existing = results.get(s.chapter.id);
    if (existing?.snippet) continue;
    results.set(s.chapter.id, { chapter: s.chapter, snippet: makeSnippet(s.plainText, q), order: s.chapter.order });
  }
  const list = [...results.values()]
    .sort((a, b) => a.order - b.order)
    .slice(0, 30)
    .map(({ chapter, snippet }) => ({
      chapter: { id: chapter.id, slug: chapter.slug, title: chapter.title, volume: chapter.volume, number: chapter.number },
      snippet,
    }));
  res.json(list);
});

function makeSnippet(text: string, q: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const idx = flat.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return flat.slice(0, 160);
  const start = Math.max(0, idx - 70);
  const end = Math.min(flat.length, idx + q.length + 90);
  return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '');
}

const RatingBody = z.object({
  clientId: z.string().uuid(),
  value: z.number().int().min(1).max(10),
});

publicRouter.post('/rating', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const { clientId, value } = parse(RatingBody, req.body);
  await prisma.rating.upsert({ where: { clientId }, create: { clientId, value }, update: { value } });
  const book = await loadBookDTO();
  res.json(book.rating);
});

/** Выгрузка всех опубликованных глав одним .txt-файлом. */
publicRouter.get('/book/download', rateLimit({ windowMs: 60_000, max: 10 }), async (_req, res) => {
  const [book, chapters] = await Promise.all([
    prisma.book.findUnique({ where: { id: 1 } }),
    prisma.chapter.findMany({
      where: { published: true },
      orderBy: { order: 'asc' },
      include: { scenes: { orderBy: { order: 'asc' }, select: { plainText: true } } },
    }),
  ]);
  if (!book) throw notFound();

  const parts = [book.title, book.author ? `Автор: ${book.author}` : '', ''];
  for (const c of chapters) {
    parts.push('', '', `${chapterLabel(c)} — ${c.title}`, '');
    parts.push(c.scenes.map((s) => s.plainText).filter(Boolean).join('\n\n'));
  }
  const filename = `${slugify(book.title)}.txt`;
  res
    .set('Content-Type', 'text/plain; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`${book.title}.txt`)}`)
    .send(parts.join('\n').trim() + '\n');
});

publicRouter.get('/favicon', async (_req, res) => {
  const book = await prisma.book.findUnique({ where: { id: 1 }, include: { favicon: true } });
  res.set('Cache-Control', 'public, max-age=300');
  res.redirect(302, book?.favicon?.url ?? '/favicon.svg');
});
