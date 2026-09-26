import type { BookDTO, ChapterDTO, ChapterSummaryDTO, SearchResultDTO } from '../../../shared/types';
import { http } from './client';

// Книга и оглавление нужны почти на каждой странице — держим их в памяти.
let bookPromise: Promise<BookDTO> | null = null;
let chaptersPromise: Promise<ChapterSummaryDTO[]> | null = null;

export const publicApi = {
  book(force = false) {
    if (!bookPromise || force) {
      bookPromise = http.get<BookDTO>('/api/book');
      bookPromise.catch(() => (bookPromise = null));
    }
    return bookPromise;
  },
  chapters(force = false) {
    if (!chaptersPromise || force) {
      chaptersPromise = http.get<ChapterSummaryDTO[]>('/api/chapters');
      chaptersPromise.catch(() => (chaptersPromise = null));
    }
    return chaptersPromise;
  },
  chapter: (slug: string) => http.get<ChapterDTO>(`/api/chapters/${encodeURIComponent(slug)}`),
  previewChapter: (id: string) => http.get<ChapterDTO>(`/api/admin/chapters/${encodeURIComponent(id)}`),
  search: (q: string) => http.get<SearchResultDTO[]>(`/api/search?q=${encodeURIComponent(q)}`),
  rate: (clientId: string, value: number) =>
    http.post<BookDTO['rating']>('/api/rating', { clientId, value }).then((rating) => {
      bookPromise = null;
      return rating;
    }),
  downloadUrl: '/api/book/download',
};
