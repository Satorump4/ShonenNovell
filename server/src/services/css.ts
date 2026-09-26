/**
 * Проверка CSS-значения фона сцены: цвет или градиент.
 * Разрешены только цвета (hex/rgb/hsl), числа, единицы и ключевые слова
 * градиентов — никаких url(), var() и прочих конструкций.
 */

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg-]+\)$/i;
const GRADIENT = /^(?:repeating-)?(?:linear|radial|conic)-gradient\((.+)\)$/i;

const WORDS = new Set([
  'to', 'top', 'bottom', 'left', 'right', 'center', 'at', 'from',
  'circle', 'ellipse', 'closest', 'farthest', 'side', 'corner', 'closest-side', 'farthest-corner',
  'deg', 'turn', 'rad', 'grad', 'px', 'em', 'rem', 'vh', 'vw',
  'rgb', 'rgba', 'hsl', 'hsla', 'transparent', 'black', 'white',
]);

export function safeBackground(value: string): string | null {
  const v = value.trim();
  if (!v || v.length > 500) return null;
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
  if (COLOR_FN.test(v)) return v;

  const g = GRADIENT.exec(v);
  if (!g) return null;
  const inner = g[1];
  if (!/^[a-z0-9#.,%()\s/-]+$/i.test(inner)) return null;
  const words = inner.replace(HEX, ' ').match(/[a-z][a-z-]*/gi) ?? [];
  if (!words.every((w) => WORDS.has(w.toLowerCase()))) return null;
  // Скобки должны быть сбалансированы.
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')' && --depth < 0) return null;
  }
  return depth === 0 ? v : null;
}
