import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config.js';
import { prisma } from '../../db.js';
import { HttpError, parse } from '../../lib/http.js';
import { cleanFilename, deleteMedia, processUpload, storeMedia, toMediaDTO } from '../../services/media.js';

export const mediaRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(env.MAX_AUDIO_MB, env.MAX_IMAGE_MB) * 1024 * 1024,
    files: 1,
    fields: 5,
  },
});

const ListQuery = z.object({ type: z.enum(['IMAGE', 'AUDIO']).optional() });

mediaRouter.get('/', async (req, res) => {
  const { type } = parse(ListQuery, req.query);
  const media = await prisma.media.findMany({ where: type ? { type } : {}, orderBy: { createdAt: 'desc' }, take: 1000 });
  res.json(media.map(toMediaDTO));
});

mediaRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Файл не передан (поле "file")');
  const processed = await processUpload(req.file.buffer);
  const media = await storeMedia(processed, cleanFilename(req.file.originalname));
  res.status(201).json(toMediaDTO(media));
});

/** Где используется файл — чтобы предупредить перед удалением. */
mediaRouter.get('/:id/usage', async (req, res) => {
  const id = String(req.params.id);
  const media = await prisma.media.findUnique({ where: { id }, select: { url: true } });
  if (!media) throw new HttpError(404, 'Not found');
  const [scenes, book, inText] = await Promise.all([
    prisma.scene.count({ where: { OR: [{ musicId: id }, { backgroundImageId: id }] } }),
    prisma.book.count({ where: { OR: [{ coverId: id }, { faviconId: id }] } }),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Scene" WHERE "content"::text LIKE ${'%' + media.url.replace(/[%_\\]/g, '\\$&') + '%'}`,
  ]);
  res.json({ scenes, book, inText: Number(inText[0]?.count ?? 0) });
});

mediaRouter.delete('/:id', async (req, res) => {
  await deleteMedia(String(req.params.id));
  res.status(204).end();
});
