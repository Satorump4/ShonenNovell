import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { Media } from '@prisma/client';
import type { MediaDTO } from '../../../shared/types.js';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';
import { getStorage } from './storage/index.js';

const MB = 1024 * 1024;

interface AudioKind {
  mime: string;
  ext: string;
}

/** Определяет аудиоформат по сигнатуре файла (расширению и MIME от клиента не доверяем). */
function detectAudio(buf: Buffer): AudioKind | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.subarray(0, 4).toString('latin1') === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') {
    return { mime: 'audio/wav', ext: 'wav' };
  }
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['M4A ', 'mp42', 'isom', 'mp41', 'iso2'].includes(brand)) return { mime: 'audio/mp4', ext: 'm4a' };
  }
  return null;
}

const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'heif']);

const newKey = (ext: string) => `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;

export function cleanFilename(name: string): string {
  // multer отдаёт имя в latin1 — восстанавливаем UTF-8 (кириллица в именах файлов).
  let decoded = name;
  try {
    decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (decoded.includes('�')) decoded = name;
  } catch {
    decoded = name;
  }
  return decoded.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim().slice(0, 180) || 'file';
}

export interface ProcessedFile {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  type: 'IMAGE' | 'AUDIO';
  width: number | null;
  height: number | null;
}

/**
 * Проверяет загруженный файл по содержимому. Изображения пережимаются в WebP
 * (с ограничением размера по большей стороне), аудио сохраняется как есть.
 * SVG не принимается: при раздаче с того же домена он может выполнять скрипты.
 */
export async function processUpload(buffer: Buffer): Promise<ProcessedFile> {
  const audio = detectAudio(buffer);
  if (audio) {
    if (buffer.length > env.MAX_AUDIO_MB * MB) throw new HttpError(413, `Audio must be at most ${env.MAX_AUDIO_MB} MB`);
    return { buffer, mimeType: audio.mime, ext: audio.ext, type: 'AUDIO', width: null, height: null };
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new HttpError(415, 'Unsupported file. Allowed: MP3, OGG, WAV, M4A, JPEG, PNG, WebP, GIF, AVIF');
  }
  if (!meta.format || !RASTER_FORMATS.has(meta.format)) {
    throw new HttpError(415, 'Unsupported image format (SVG is not allowed)');
  }
  if (buffer.length > env.MAX_IMAGE_MB * MB) throw new HttpError(413, `Image must be at most ${env.MAX_IMAGE_MB} MB`);

  const animated = (meta.pages ?? 1) > 1;
  const { data, info } = await sharp(buffer, { animated, limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: 'image/webp',
    ext: 'webp',
    type: 'IMAGE',
    width: info.width,
    height: animated ? ((info as { pageHeight?: number }).pageHeight ?? info.height) : info.height,
  };
}

/** Сохраняет обработанный файл в хранилище и создаёт запись Media. */
export async function storeMedia(file: ProcessedFile, filename: string): Promise<Media> {
  const storage = await getStorage();
  const key = newKey(file.ext);
  const url = await storage.put(key, file.buffer, file.mimeType);
  try {
    return await prisma.media.create({
      data: {
        filename,
        storageKey: key,
        url,
        type: file.type,
        mimeType: file.mimeType,
        size: file.buffer.length,
        width: file.width,
        height: file.height,
      },
    });
  } catch (err) {
    await storage.delete(key).catch(() => undefined);
    throw err;
  }
}

export async function deleteMedia(id: string) {
  const media = await prisma.media.delete({ where: { id } });
  const storage = await getStorage();
  await storage.delete(media.storageKey).catch((err) => console.warn('[media] failed to delete file', err));
}

export function toMediaDTO(m: Media): MediaDTO {
  return {
    id: m.id,
    filename: m.filename,
    url: m.url,
    type: m.type,
    mimeType: m.mimeType,
    size: m.size,
    width: m.width,
    height: m.height,
    createdAt: m.createdAt.toISOString(),
  };
}
