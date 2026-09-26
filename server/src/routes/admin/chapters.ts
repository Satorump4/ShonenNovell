import { Router } from 'express';
import { z } from 'zod';
import type { AdminChapterSummaryDTO } from '../../../../shared/types.js';
import { prisma } from '../../db.js';
import { HttpError, notFound, parse } from '../../lib/http.js';
import { loadChapter, toSummaryDTO } from '../../services/chapters.js';
import { isValidSlug, uniqueSlug } from '../../services/slug.js';
import { emptyDocJson } from '../../services/tiptap.js';

export const chaptersRouter = Router();

chaptersRouter.get('/', async (_req, res) => {
  const chapters = await prisma.chapter.findMany({
    orderBy: { order: 'asc' },
    include: { _count: { select: { scenes: true } } },
  });
  const list: AdminChapterSummaryDTO[] = chapters.map((c) => ({
    ...toSummaryDTO(c),
    published: c.published,
    updatedAt: c.updatedAt.toISOString(),
    sceneCount: c._count.scenes,
  }));
  res.json(list);
});

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  volume: z.number().int().min(0).max(9999).nullable().optional(),
  number: z.string().trim().max(20).optional(),
});

chaptersRouter.post('/', async (req, res) => {
  const body = parse(CreateBody, req.body);
  const last = await prisma.chapter.findFirst({ orderBy: { order: 'desc' }, select: { order: true, volume: true } });
  const count = await prisma.chapter.count();
  const chapter = await prisma.chapter.create({
    data: {
      title: body.title,
      slug: await uniqueSlug(body.title),
      volume: body.volume === undefined ? (last?.volume ?? null) : body.volume,
      number: body.number || String(count + 1),
      order: (last?.order ?? 0) + 1,
      // Каждая глава начинается с одной сцены — текст всегда живёт в сценах.
      scenes: { create: { title: 'Сцена 1', order: 1, content: emptyDocJson() } },
    },
  });
  res.status(201).json(await loadChapter({ id: chapter.id }, false));
});

/** Полная глава со сценами (в т.ч. черновик) — для редактора и предпросмотра. */
chaptersRouter.get('/:id', async (req, res) => {
  const chapter = await loadChapter({ id: String(req.params.id) }, false);
  if (!chapter) throw notFound('Chapter not found');
  res.json(chapter);
});

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(100).optional(),
  volume: z.number().int().min(0).max(9999).nullable().optional(),
  number: z.string().trim().min(1).max(20).optional(),
  published: z.boolean().optional(),
});

chaptersRouter.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const body = parse(UpdateBody, req.body);
  const current = await prisma.chapter.findUnique({ where: { id } });
  if (!current) throw notFound('Chapter not found');

  let slug: string | undefined;
  if (body.slug === '') {
    // Пустой адрес — сгенерировать заново из названия.
    slug = await uniqueSlug(body.title ?? current.title, id);
  } else if (body.slug !== undefined && body.slug !== current.slug) {
    if (!isValidSlug(body.slug)) throw new HttpError(400, 'Адрес может содержать только a-z, 0-9 и дефисы');
    const taken = await prisma.chapter.findUnique({ where: { slug: body.slug }, select: { id: true } });
    if (taken && taken.id !== id) throw new HttpError(409, 'Такой адрес уже занят другой главой');
    slug = body.slug;
  }

  await prisma.chapter.update({
    where: { id },
    data: {
      title: body.title,
      slug,
      volume: body.volume,
      number: body.number,
      published: body.published,
      // Дата публикации фиксируется при первой публикации.
      publishedAt: body.published && !current.publishedAt ? new Date() : undefined,
    },
  });
  res.json(await loadChapter({ id }, false));
});

chaptersRouter.delete('/:id', async (req, res) => {
  await prisma.chapter.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
});

const OrderBody = z.object({ ids: z.array(z.string().max(40)).max(10_000) });

/** Новый порядок глав: полный список id в нужной последовательности. */
chaptersRouter.put('/order/all', async (req, res) => {
  const { ids } = parse(OrderBody, req.body);
  const existing = await prisma.chapter.findMany({ select: { id: true } });
  const known = new Set(existing.map((c) => c.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw new HttpError(400, 'Список должен содержать все главы ровно по одному разу');
  }
  await prisma.$transaction(ids.map((id, i) => prisma.chapter.update({ where: { id }, data: { order: i + 1 } })));
  res.status(204).end();
});

/** Новый порядок сцен внутри главы. */
chaptersRouter.put('/:id/scenes/order', async (req, res) => {
  const chapterId = String(req.params.id);
  const { ids } = parse(OrderBody, req.body);
  const scenes = await prisma.scene.findMany({ where: { chapterId }, select: { id: true } });
  const known = new Set(scenes.map((s) => s.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw new HttpError(400, 'Список должен содержать все сцены главы ровно по одному разу');
  }
  await prisma.$transaction(ids.map((id, i) => prisma.scene.update({ where: { id }, data: { order: i + 1 } })));
  res.status(204).end();
});
