import type {
  AdminBookDTO,
  AdminChapterSummaryDTO,
  AdminMeDTO,
  ChapterDTO,
  InfoItem,
  MediaDTO,
  MediaType,
  MusicMode,
  SceneDTO,
  TiptapNode,
} from '../../../shared/types';
import { http, uploadFile } from './client';

export interface ChapterUpdate {
  title?: string;
  slug?: string;
  volume?: number | null;
  number?: string;
  published?: boolean;
}

export interface SceneUpdate {
  title?: string;
  content?: TiptapNode;
  musicMode?: MusicMode;
  musicId?: string | null;
  volume?: number;
  background?: string | null;
  backgroundImageId?: string | null;
  backgroundDim?: number;
  transitionMs?: number;
}

export interface BookUpdate {
  title: string;
  originalTitle: string | null;
  author: string;
  description: string;
  info: InfoItem[];
  coverId: string | null;
  faviconId: string | null;
  defaultBackground: string;
}

export const adminApi = {
  login: (username: string, password: string) => http.post<AdminMeDTO>('/api/admin/login', { username, password }),
  logout: () => http.post<void>('/api/admin/logout'),
  me: () => http.get<AdminMeDTO>('/api/admin/me'),
  changePassword: (current: string, next: string) => http.put<void>('/api/admin/password', { current, next }),

  book: () => http.get<AdminBookDTO>('/api/admin/book'),
  saveBook: (data: BookUpdate) => http.put<AdminBookDTO>('/api/admin/book', data),

  chapters: () => http.get<AdminChapterSummaryDTO[]>('/api/admin/chapters'),
  chapter: (id: string) => http.get<ChapterDTO>(`/api/admin/chapters/${id}`),
  createChapter: (title: string) => http.post<ChapterDTO>('/api/admin/chapters', { title }),
  updateChapter: (id: string, data: ChapterUpdate) => http.put<ChapterDTO>(`/api/admin/chapters/${id}`, data),
  deleteChapter: (id: string) => http.del(`/api/admin/chapters/${id}`),
  reorderChapters: (ids: string[]) => http.put<void>('/api/admin/chapters/order/all', { ids }),

  createScene: (chapterId: string) => http.post<SceneDTO>('/api/admin/scenes', { chapterId }),
  updateScene: (id: string, data: SceneUpdate) => http.put<SceneDTO>(`/api/admin/scenes/${id}`, data),
  deleteScene: (id: string) => http.del(`/api/admin/scenes/${id}`),
  reorderScenes: (chapterId: string, ids: string[]) => http.put<void>(`/api/admin/chapters/${chapterId}/scenes/order`, { ids }),

  media: (type?: MediaType) => http.get<MediaDTO[]>(`/api/admin/media${type ? `?type=${type}` : ''}`),
  upload: (file: File, onProgress?: (f: number) => void) => uploadFile<MediaDTO>('/api/admin/media', file, onProgress),
  mediaUsage: (id: string) => http.get<{ scenes: number; book: number; inText: number }>(`/api/admin/media/${id}/usage`),
  deleteMedia: (id: string) => http.del(`/api/admin/media/${id}`),
};
