import type { Prisma } from '@prisma/client';
import type { TiptapMark, TiptapNode } from '../../../shared/types.js';
import { HttpError } from '../lib/http.js';

/**
 * Проверка и очистка Tiptap JSON.
 * Разрешён только фиксированный набор узлов, меток и атрибутов; всё прочее
 * отбрасывается. Ссылки и изображения — только безопасные URL.
 * В базу попадает уже очищенный документ, а ридер рендерит его
 * React-компонентами без innerHTML, поэтому XSS через текст книги невозможен.
 */

const MAX_DEPTH = 16;
const MAX_NODES = 60_000;
const MAX_TEXT = 1_500_000;
const MAX_STRING = 2048;

type Category = 'block' | 'inline' | 'listItem';

interface NodeSpec {
  category: Category | 'root';
  children: Category | null;
  attrs?: (raw: Record<string, unknown>) => Record<string, unknown> | undefined;
}

export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (!href || href.length > MAX_STRING) return null;
  if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  if (/^https?:\/\//i.test(href)) {
    try {
      return new URL(href).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const src = value.trim();
  if (!src || src.length > MAX_STRING) return null;
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(src)) return src;
  if (/^https:\/\//i.test(src)) {
    try {
      return new URL(src).toString();
    } catch {
      return null;
    }
  }
  return null;
}

const shortString = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined);

const SPECS: Record<string, NodeSpec> = {
  doc: { category: 'root', children: 'block' },
  paragraph: { category: 'block', children: 'inline' },
  heading: {
    category: 'block',
    children: 'inline',
    attrs: (a) => ({ level: [1, 2, 3].includes(Number(a.level)) ? Number(a.level) : 2 }),
  },
  blockquote: { category: 'block', children: 'block' },
  bulletList: { category: 'block', children: 'listItem' },
  orderedList: {
    category: 'block',
    children: 'listItem',
    attrs: (a) => {
      const start = Number(a.start);
      return { start: Number.isInteger(start) && start >= 1 && start < 100_000 ? start : 1 };
    },
  },
  listItem: { category: 'listItem', children: 'block' },
  horizontalRule: { category: 'block', children: null },
  image: {
    category: 'block',
    children: null,
    attrs: (a) => {
      const src = safeImageSrc(a.src);
      if (!src) return undefined; // изображение без безопасного src выбрасываем целиком
      return { src, alt: shortString(a.alt) ?? null, title: shortString(a.title) ?? null };
    },
  },
  hardBreak: { category: 'inline', children: null },
  text: { category: 'inline', children: null },
};

const SIMPLE_MARKS = new Set(['bold', 'italic', 'strike']);

interface Budget {
  nodes: number;
  text: number;
}

function sanitizeMarks(marks: unknown): TiptapMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: TiptapMark[] = [];
  const seen = new Set<string>();
  for (const m of marks.slice(0, 8)) {
    if (!m || typeof m !== 'object') continue;
    const type = (m as TiptapMark).type;
    if (typeof type !== 'string' || seen.has(type)) continue;
    if (SIMPLE_MARKS.has(type)) {
      out.push({ type });
      seen.add(type);
    } else if (type === 'link') {
      const href = safeHref((m as TiptapMark).attrs?.href);
      if (href) {
        out.push({ type: 'link', attrs: { href } });
        seen.add(type);
      }
    }
  }
  return out.length ? out : undefined;
}

function emptyParagraph(): TiptapNode {
  return { type: 'paragraph' };
}

function sanitizeNode(raw: unknown, depth: number, budget: Budget): TiptapNode | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (depth > MAX_DEPTH) throw new HttpError(400, 'Document is nested too deeply');
  if (++budget.nodes > MAX_NODES) throw new HttpError(400, 'Document is too large');

  const node = raw as TiptapNode;
  const spec = SPECS[node.type];
  if (!spec) return null;

  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length === 0) return null;
    budget.text += node.text.length;
    if (budget.text > MAX_TEXT) throw new HttpError(400, 'Document text is too long');
    const marks = sanitizeMarks(node.marks);
    return marks ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text };
  }

  const out: TiptapNode = { type: node.type };
  if (spec.attrs) {
    const attrs = spec.attrs(node.attrs && typeof node.attrs === 'object' ? node.attrs : {});
    if (!attrs) return null;
    out.attrs = attrs;
  }

  if (spec.children) {
    const children: TiptapNode[] = [];
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        const clean = sanitizeNode(child, depth + 1, budget);
        if (clean && SPECS[clean.type].category === spec.children) children.push(clean);
      }
    }
    // Узлы-контейнеры блоков не могут быть пустыми по схеме ProseMirror.
    if (children.length === 0 && spec.children === 'block') children.push(emptyParagraph());
    if (children.length === 0 && spec.children === 'listItem') return null;
    if (children.length) out.content = children;
  }
  return out;
}

/** Очищает документ; бросает 400, если это вообще не Tiptap-документ. */
export function sanitizeDoc(raw: unknown): TiptapNode {
  if (!raw || typeof raw !== 'object' || (raw as TiptapNode).type !== 'doc') {
    throw new HttpError(400, 'Content must be a Tiptap document ({ "type": "doc" })');
  }
  const doc = sanitizeNode(raw, 0, { nodes: 0, text: 0 });
  return doc ?? { type: 'doc', content: [emptyParagraph()] };
}

export const emptyDoc = (): TiptapNode => ({ type: 'doc', content: [emptyParagraph()] });

/** Пустой документ в виде значения для Json-поля Prisma. */
export const emptyDocJson = () => emptyDoc() as unknown as Prisma.InputJsonValue;

/** Плоский текст документа: блоки разделяются переводом строки. */
export function docToText(doc: TiptapNode): string {
  const lines: string[] = [];
  const walk = (node: TiptapNode, listPrefix = ''): void => {
    switch (node.type) {
      case 'paragraph':
      case 'heading': {
        lines.push(listPrefix + inlineText(node));
        return;
      }
      case 'horizontalRule':
        lines.push('* * *');
        return;
      case 'image':
        return;
      case 'bulletList':
        node.content?.forEach((item) => item.content?.forEach((c) => walk(c, '• ')));
        return;
      case 'orderedList': {
        const start = Number(node.attrs?.start ?? 1);
        node.content?.forEach((item, i) => item.content?.forEach((c) => walk(c, `${start + i}. `)));
        return;
      }
      default:
        node.content?.forEach((c) => walk(c, listPrefix));
    }
  };
  walk(doc);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inlineText(node: TiptapNode): string {
  return (node.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : c.type === 'hardBreak' ? '\n' : '')).join('');
}
