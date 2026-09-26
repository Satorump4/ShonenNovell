// Типы, общие для backend и frontend (формат ответов API).

export type MusicMode = 'INHERIT' | 'TRACK' | 'SILENCE';
export type MediaType = 'IMAGE' | 'AUDIO';

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

export interface InfoItem {
  label: string;
  value: string;
}

export interface MediaDTO {
  id: string;
  filename: string;
  url: string;
  type: MediaType;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MediaRef {
  id: string;
  url: string;
  filename: string;
}

export interface BookDTO {
  title: string;
  originalTitle: string | null;
  author: string;
  description: string;
  info: InfoItem[];
  coverUrl: string | null;
  faviconUrl: string | null;
  defaultBackground: string;
  chapterCount: number;
  rating: { average: number | null; count: number };
}

export interface ChapterSummaryDTO {
  id: string;
  slug: string;
  title: string;
  volume: number | null;
  number: string;
  order: number;
  publishedAt: string | null;
}

export interface SceneDTO {
  id: string;
  title: string;
  order: number;
  content: TiptapNode;
  musicMode: MusicMode;
  music: MediaRef | null;
  volume: number;
  background: string | null;
  backgroundImage: MediaRef | null;
  backgroundDim: number;
  transitionMs: number;
}

export interface ChapterNavDTO {
  id: string;
  slug: string;
  title: string;
  volume: number | null;
  number: string;
}

export interface ChapterDTO extends ChapterSummaryDTO {
  published: boolean;
  scenes: SceneDTO[];
  prev: ChapterNavDTO | null;
  next: ChapterNavDTO | null;
}

export interface SearchResultDTO {
  chapter: ChapterNavDTO;
  snippet: string;
}

// ---- Админка ----

export interface AdminChapterSummaryDTO extends ChapterSummaryDTO {
  published: boolean;
  updatedAt: string;
  sceneCount: number;
}

export interface AdminBookDTO {
  title: string;
  originalTitle: string | null;
  author: string;
  description: string;
  info: InfoItem[];
  cover: MediaDTO | null;
  favicon: MediaDTO | null;
  defaultBackground: string;
}

export interface AdminMeDTO {
  username: string;
}
