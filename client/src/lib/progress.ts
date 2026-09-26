import { readJSON, writeJSON } from './storage';

/** Позиция чтения главы. Храним локально — регистрация читателям не нужна. */
export interface ReadingPosition {
  chapterId: string;
  slug: string;
  title: string;
  number: string;
  volume: number | null;
  /** 0..1 */
  percent: number;
  /** Индекс верхнего видимого абзаца (точнее, чем проценты, если поменялся шрифт). */
  block: number;
  scene: number;
  updatedAt: number;
}

const POSITIONS = 'reader.positions';
const LAST = 'reader.last';
const HISTORY = 'reader.history';
const READ = 'reader.read';

export const getPositions = () => readJSON<Record<string, ReadingPosition>>(POSITIONS, {});
export const getPosition = (slug: string): ReadingPosition | null => getPositions()[slug] ?? null;
export const getLastPosition = () => readJSON<ReadingPosition | null>(LAST, null);
export const getHistory = () => readJSON<ReadingPosition[]>(HISTORY, []);
export const getReadIds = () => new Set(readJSON<string[]>(READ, []));

export function savePosition(pos: ReadingPosition) {
  const positions = getPositions();
  positions[pos.slug] = pos;
  // Не даём хранилищу разрастаться бесконечно.
  const entries = Object.values(positions).sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = Object.fromEntries(entries.slice(0, 400).map((p) => [p.slug, p]));
  writeJSON(POSITIONS, trimmed);
  writeJSON(LAST, pos);

  const history = [pos, ...getHistory().filter((h) => h.slug !== pos.slug)].slice(0, 12);
  writeJSON(HISTORY, history);

  if (pos.percent >= 0.95) {
    const read = getReadIds();
    if (!read.has(pos.chapterId)) {
      read.add(pos.chapterId);
      writeJSON(READ, [...read]);
    }
  }
}
