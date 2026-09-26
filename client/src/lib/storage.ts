import { useSyncExternalStore } from 'react';

/** localStorage может быть недоступен (приватный режим, запрет cookies) — не падаем. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — работаем без сохранения */
  }
}

/**
 * Маленькое реактивное хранилище с сохранением в localStorage.
 * Используется для настроек ридера и личной полки.
 */
export function createPersistentStore<T extends object>(key: string, defaults: T) {
  let state: T = { ...defaults, ...readJSON<Partial<T>>(key, {}) };
  const listeners = new Set<() => void>();

  const store = {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      writeJSON(key, state);
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // Синхронизация между вкладками.
  window.addEventListener('storage', (e) => {
    if (e.key !== key) return;
    state = { ...defaults, ...readJSON<Partial<T>>(key, {}) };
    listeners.forEach((l) => l());
  });

  return store;
}

export function useStore<T extends object>(store: ReturnType<typeof createPersistentStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
