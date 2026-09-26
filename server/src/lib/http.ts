import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (message = 'Not found') => new HttpError(404, message);

/** Проверяет данные схемой zod; при ошибке — 400 с описанием полей. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, 'Validation failed', result.error.flatten());
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'File is too large' : err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Already exists' });
      return;
    }
  }
  const type = (err as { type?: string } | undefined)?.type;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large' });
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
