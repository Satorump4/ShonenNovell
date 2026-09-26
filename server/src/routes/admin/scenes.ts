import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, notFound, parse } from '../../lib/http.js';
import { sceneInclude, toSceneDTO } from '../../services/chapters.js';
import { safeBackground } from '../../services/css.js';
import { docToText, emptyDocJson, sanitizeDoc } from '../../services/tiptap.js';

export const scenesRouter = Router();

const CreateBody = z.object({
  chapterId: z.string().max(40),
  title: z.string().trim().max(200).optional(),
});

scenesRouter.post('/', async (req, res) => {
  const { chapterId, title } = parse(CreateBody, req.body);
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true } });
  if (!chapter) throw notFound('Chapter not found');
  const last = await prisma.scene.findFirst({ where: { chapterId }, orderBy: { order: 'desc' }, select: { order: true } });
  const order = (last?.order ?? 0) + 1;
  const scene = await prisma.scene.create({
    data: { chapterId, order, title: title || `Сцена ${order}`, content: emptyDocJson() },
    include: sceneInclude,
  });
  res.status(201).json(toSceneDTO(scene));
});

const UpdateBody = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.unknown().optional(),
  musicMode: z.enum(['INHERIT', 'TRACK', 'SILENCE']).optional(),
  musicId: z.string().max(40).nullable().optional(),
  volume: z.number().min(0).max(1).optional(),
  background: z.string().max(500).nullable().optional(),
  backgroundImageId: z.string().max(40).nullable().optional(),
  backgroundDim: z.number().min(0).max(0.9).optional(),
  transitionMs: z.number().int().min(0).max(6000).optional(),
});

async function assertMedia(id: string, type: 'IMAGE' | 'AUDIO') {
  const media = await prisma.media.findFirst({ where: { id, type }, select: { id: true } });
  if (!media) throw new HttpError(400, type === 'AUDIO' ? 'Трек не найден в медиатеке' : 'Изображение не найдено в медиатеке');
}

scenesRouter.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const body = parse(UpdateBody, req.body);
  const data: Prisma.SceneUncheckedUpdateInput = {
    title: body.title,
    musicMode: body.musicMode,
    volume: body.volume,
    backgroundDim: body.backgroundDim,
    transitionMs: body.transitionMs,
  };

  if (body.content !== undefined) {
    const doc = sanitizeDoc(body.content);
    data.content = doc as unknown as Prisma.InputJsonValue;
    data.plainText = docToText(doc);
  }
  if (body.musicId !== undefined) {
    if (body.musicId) await assertMedia(body.musicId, 'AUDIO');
    data.musicId = body.musicId;
  }
  if (body.backgroundImageId !== undefined) {
    if (body.backgroundImageId) await assertMedia(body.backgroundImageId, 'IMAGE');
    data.backgroundImageId = body.backgroundImageId;
  }
  if (body.background !== undefined) {
    if (body.background === null || body.background.trim() === '') {
      data.background = null;
    } else {
      const bg = safeBackground(body.background);
      if (!bg) throw new HttpError(400, 'Фон: допустимы только цвет (#rrggbb, rgb(), hsl()) или CSS-градиент');
      data.background = bg;
    }
  }

  const scene = await prisma.scene.update({ where: { id }, data, include: sceneInclude });
  res.json(toSceneDTO(scene));
});

scenesRouter.delete('/:id', async (req, res) => {
  const scene = await prisma.scene.findUnique({ where: { id: String(req.params.id) }, select: { id: true, chapterId: true } });
  if (!scene) throw notFound('Scene not found');
  const count = await prisma.scene.count({ where: { chapterId: scene.chapterId } });
  if (count <= 1) throw new HttpError(400, 'В главе должна остаться хотя бы одна сцена');
  await prisma.scene.delete({ where: { id: scene.id } });
  res.status(204).end();
});
