import { useSyncExternalStore } from 'react';
import { createPersistentStore, useStore } from './storage';

export interface ReaderSettings {
  fontSize: number;
  width: number;
  lineHeight: number;
  font: 'serif' | 'sans';
  music: boolean;
  volume: number;
  animations: boolean;
  /** 0.4..1 — затемнение всей страницы. */
  brightness: number;
  /** Пользователь уже видел экран про музыку. */
  introSeen: boolean;
}

export const settingsStore = createPersistentStore<ReaderSettings>('reader.settings', {
  fontSize: 19,
  width: 700,
  lineHeight: 1.8,
  font: 'serif',
  music: true,
  volume: 0.8,
  animations: true,
  brightness: 1,
  introSeen: false,
});

export const useSettings = () => useStore(settingsStore);

const reducedMotionQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Учитывает системную настройку prefers-reduced-motion. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      reducedMotionQuery?.addEventListener('change', cb);
      return () => reducedMotionQuery?.removeEventListener('change', cb);
    },
    () => reducedMotionQuery?.matches ?? false,
    () => false,
  );
}
