import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { AdminBookDTO, InfoItem } from '../../../../shared/types.js';
import { prisma } from '../../db.js';
import { HttpError, parse } from '../../lib/http.js';
import { safeBackground } from '../../services/css.js';
import { toMediaDTO } from '../../services/media.js';

export const bookRouter = Router();

async function loadAdminBook(): Promise<AdminBookDTO> {
  const book = await prisma.book.findUniqueOrThrow({ where: { id: 1 }, include: { cover: true, favicon: true } });
  return {
    title: book.title,
    originalTitle: book.originalTitle,
    author: book.author,
    description: book.description,
    info: (Array.isArray(book.info) ? book.info : []) as unknown as InfoItem[],
    cover: book.cover ? toMediaDTO(book.cover) : null,
    favicon: book.favicon ? toMediaDTO(book.favicon) : null,
    defaultBackground: book.defaultBackground,
  };
}

bookRouter.get('/', async (_req, res) => {
  res.json(await loadAdminBook());
});

const BookBody = z.object({
  title: z.string().trim().min(1).max(200),
  originalTitle: z.string().trim().max(300).nullable(),
  author: z.string().trim().max(200),
  description: z.string().max(10_000),
  info: z
    .array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(300) }))
    .max(30),
  coverId: z.string().max(40).nullable(),
  faviconId: z.string().max(40).nullable(),
  defaultBackground: z.string().max(500),
});

bookRouter.put('/', async (req, res) => {
  const body = parse(BookBody, req.body);
  const background = safeBackground(body.defaultBackground);
  if (!background) throw new HttpError(400, 'Недопустимое значение фона');
  for (const id of [body.coverId, body.faviconId]) {
    if (id && !(await prisma.media.findFirst({ where: { id, type: 'IMAGE' }, select: { id: true } }))) {
      throw new HttpError(400, 'Изображение не найдено в медиатеке');
    }
  }
  await prisma.book.update({
    where: { id: 1 },
    data: {
      title: body.title,
      originalTitle: body.originalTitle || null,
      author: body.author,
      description: body.description,
      info: body.info as Prisma.InputJsonValue,
      coverId: body.coverId,
      faviconId: body.faviconId,
      defaultBackground: background,
    },
  });
  res.json(await loadAdminBook());
});
