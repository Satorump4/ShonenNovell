export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function chapterLabel(c: { volume: number | null; number: string }): string {
  return `${c.volume != null ? `Том ${c.volume} ` : ''}Глава ${c.number}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** plural(5, ['глава', 'главы', 'глав']) → «глав» */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** UUID v4 для браузеров без crypto.randomUUID (нестандартный http-контекст). */
function uuidFallback(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Анонимный идентификатор браузера (для оценки книги без регистрации). */
export function clientId(): string {
  const KEY = 'reader.clientId';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
  } catch {
    /* без хранилища — одноразовый id */
  }
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidFallback();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
