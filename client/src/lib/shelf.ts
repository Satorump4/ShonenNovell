import { createPersistentStore, useStore } from './storage';

/** Личная полка читателя («Добавить в планы») — хранится только в браузере. */
export type ShelfStatus = 'reading' | 'planned' | 'completed' | 'favorite' | 'dropped';

export const SHELF_LABELS: Record<ShelfStatus, string> = {
  reading: 'Читаю',
  planned: 'В планах',
  completed: 'Прочитано',
  favorite: 'Любимое',
  dropped: 'Брошено',
};

export const shelfStore = createPersistentStore<{ status: ShelfStatus | null; rating: number | null }>('reader.shelf', {
  status: null,
  rating: null,
});

export const useShelf = () => useStore(shelfStore);
