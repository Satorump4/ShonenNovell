import type { Chapter, Media, Prisma, Scene } from '@prisma/client';
import type { ChapterDTO, ChapterNavDTO, ChapterSummaryDTO, SceneDTO, TiptapNode } from '../../../shared/types.js';
import { prisma } from '../db.js';

export const sceneInclude = {
  music: true,
  backgroundImage: true,
} satisfies Prisma.SceneInclude;

type SceneWithMedia = Scene & { music: Media | null; backgroundImage: Media | null };

const ref = (m: Media | null) => (m ? { id: m.id, url: m.url, filename: m.filename } : null);

export function toSceneDTO(s: SceneWithMedia): SceneDTO {
  return {
    id: s.id,
    title: s.title,
    order: s.order,
    content: s.content as unknown as TiptapNode,
    musicMode: s.musicMode,
    music: ref(s.music),
    volume: s.volume,
    background: s.background,
    backgroundImage: ref(s.backgroundImage),
    backgroundDim: s.backgroundDim,
    transitionMs: s.transitionMs,
  };
}

export function toSummaryDTO(c: Chapter): ChapterSummaryDTO {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    volume: c.volume,
    number: c.number,
    order: c.order,
    publishedAt: c.publishedAt?.toISOString() ?? null,
  };
}

const navSelect = { id: true, slug: true, title: true, volume: true, number: true } satisfies Prisma.ChapterSelect;

/**
 * Собирает главу для ридера вместе с соседними главами.
 * onlyPublished=false используется предпросмотром в админке.
 */
export async function loadChapter(where: Prisma.ChapterWhereUniqueInput, onlyPublished: boolean): Promise<ChapterDTO | null> {
  const chapter = await prisma.chapter.findUnique({
    where,
    include: { scenes: { orderBy: { order: 'asc' }, include: sceneInclude } },
  });
  if (!chapter || (onlyPublished && !chapter.published)) return null;

  const scope: Prisma.ChapterWhereInput = onlyPublished ? { published: true } : {};
  const [prev, next] = await Promise.all([
    prisma.chapter.findFirst({ where: { ...scope, order: { lt: chapter.order } }, orderBy: { order: 'desc' }, select: navSelect }),
    prisma.chapter.findFirst({ where: { ...scope, order: { gt: chapter.order } }, orderBy: { order: 'asc' }, select: navSelect }),
  ]);

  return {
    ...toSummaryDTO(chapter),
    published: chapter.published,
    scenes: chapter.scenes.map(toSceneDTO),
    prev: prev as ChapterNavDTO | null,
    next: next as ChapterNavDTO | null,
  };
}

/** Метка главы для списков и выгрузки: «Том 1 Глава 3». */
export function chapterLabel(c: { volume: number | null; number: string }) {
  return `${c.volume != null ? `Том ${c.volume} ` : ''}Глава ${c.number}`;
}
