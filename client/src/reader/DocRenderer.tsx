import type { ReactNode } from 'react';
import type { TiptapMark, TiptapNode } from '../../../shared/types';

/**
 * Рендер Tiptap JSON в React без innerHTML.
 * Сервер уже очистил документ, но ссылки и картинки проверяются ещё раз —
 * защита в глубину. В бандл ридера сам Tiptap не попадает.
 */

function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  if (/^(https?:\/\/|mailto:|#)/i.test(href) || (href.startsWith('/') && !href.startsWith('//'))) return href;
  return null;
}

function safeSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null;
  return /^(https:\/\/|\/uploads\/)/i.test(src) ? src : null;
}

function applyMark(mark: TiptapMark, child: ReactNode, key: number): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{child}</strong>;
    case 'italic':
      return <em key={key}>{child}</em>;
    case 'strike':
      return <s key={key}>{child}</s>;
    case 'link': {
      const href = safeHref(mark.attrs?.href);
      if (!href) return child;
      const external = /^https?:\/\//i.test(href);
      return (
        <a key={key} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
          {child}
        </a>
      );
    }
    default:
      return child;
  }
}

function renderChildren(node: TiptapNode): ReactNode[] {
  return (node.content ?? []).map((child, i) => renderNode(child, i));
}

function renderNode(node: TiptapNode, key: number, blockIndex?: number): ReactNode {
  const block = blockIndex !== undefined ? { 'data-block': blockIndex } : {};
  switch (node.type) {
    case 'text': {
      let out: ReactNode = node.text ?? '';
      // Порядок: ссылка снаружи, оформление внутри.
      const marks = [...(node.marks ?? [])].sort((a, b) => (a.type === 'link' ? 1 : 0) - (b.type === 'link' ? 1 : 0));
      marks.forEach((m, i) => (out = applyMark(m, out, i)));
      return <span key={key}>{out}</span>;
    }
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return (
        <p key={key} {...block}>
          {node.content?.length ? renderChildren(node) : <br />}
        </p>
      );
    case 'heading': {
      const level = Number(node.attrs?.level);
      const Tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';
      return (
        <Tag key={key} {...block}>
          {renderChildren(node)}
        </Tag>
      );
    }
    case 'blockquote':
      return (
        <blockquote key={key} {...block}>
          {renderChildren(node)}
        </blockquote>
      );
    case 'bulletList':
      return (
        <ul key={key} {...block}>
          {renderChildren(node)}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} start={Number(node.attrs?.start) || 1} {...block}>
          {renderChildren(node)}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{renderChildren(node)}</li>;
    case 'horizontalRule':
      return <hr key={key} {...block} />;
    case 'image': {
      const src = safeSrc(node.attrs?.src);
      if (!src) return null;
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : undefined;
      return <img key={key} src={src} alt={alt} title={title} loading="lazy" decoding="async" {...block} />;
    }
    default:
      return null;
  }
}

/** Рендерит документ; верхнеуровневые блоки получают сквозной индекс data-block. */
export function DocRenderer({ doc, blockOffset = 0 }: { doc: TiptapNode; blockOffset?: number }) {
  return <>{(doc.content ?? []).map((node, i) => renderNode(node, i, blockOffset + i))}</>;
}

export const countBlocks = (doc: TiptapNode) => doc.content?.length ?? 0;
