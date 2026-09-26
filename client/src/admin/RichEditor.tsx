import { useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import type { TiptapNode } from '../../../shared/types';
import { Button, cx, Modal } from '../components/ui';
import { TextInput } from './fields';
import { MediaPickerModal } from './MediaPicker';

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // не терять выделение в редакторе
      onClick={onClick}
      className={cx(
        'flex size-8 items-center justify-center rounded transition-colors disabled:opacity-30',
        active ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-white/10 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-line" />;

function Toolbar({ editor, onLink, onImage }: { editor: Editor; onLink: () => void; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const i = 'size-4';

  return (
    <div className="sticky top-[50px] z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-line bg-panel px-2 py-1.5">
      <ToolButton label="Жирный (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className={i} />
      </ToolButton>
      <ToolButton label="Курсив (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className={i} />
      </ToolButton>
      <ToolButton label="Зачёркнутый" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className={i} />
      </ToolButton>
      <Sep />
      <ToolButton label="Заголовок 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        <Heading1 className={i} />
      </ToolButton>
      <ToolButton label="Заголовок 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 className={i} />
      </ToolButton>
      <ToolButton label="Заголовок 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 className={i} />
      </ToolButton>
      <Sep />
      <ToolButton label="Цитата" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className={i} />
      </ToolButton>
      <ToolButton label="Маркированный список" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className={i} />
      </ToolButton>
      <ToolButton label="Нумерованный список" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className={i} />
      </ToolButton>
      <ToolButton label="Разделитель" onClick={() => chain().setHorizontalRule().run()}>
        <Minus className={i} />
      </ToolButton>
      <Sep />
      <ToolButton label="Ссылка" active={s.link} onClick={onLink}>
        <LinkIcon className={i} />
      </ToolButton>
      <ToolButton label="Изображение" onClick={onImage}>
        <ImageIcon className={i} />
      </ToolButton>
      <Sep />
      <ToolButton label="Отменить (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 className={i} />
      </ToolButton>
      <ToolButton label="Повторить (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 className={i} />
      </ToolButton>
    </div>
  );
}

function LinkDialog({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const [href, setHref] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Подставляем текущую ссылку при открытии.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setHref((editor.getAttributes('link').href as string | undefined) ?? '');
      setError(null);
    }
  }

  const apply = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const normalized = /^[a-z]+:|^\/|^#/i.test(value) ? value : `https://${value}`;
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(normalized)) {
      setError('Разрешены ссылки http(s)://, mailto:, /путь и #якорь');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Ссылка">
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <TextInput autoFocus placeholder="https://example.com" value={href} onChange={(e) => setHref(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <p className="text-[12px] text-faint">Чтобы убрать ссылку, очистите поле и нажмите «Применить».</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="primary">
            Применить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Редактор текста сцены. На выходе — Tiptap JSON; сервер его проверяет и очищает.
 */
export function RichEditor({ value, onChange, placeholder }: { value: TiptapNode; onChange: (doc: TiptapNode) => void; placeholder?: string }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Текст сцены…' }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'book-text font-serif px-5 py-5 sm:px-8', spellcheck: 'true' },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as TiptapNode),
  });

  if (!editor) return null;

  return (
    <div className="editor rounded-md border border-line bg-page" style={{ ['--reader-size' as string]: '17px' }}>
      <Toolbar editor={editor} onLink={() => setLinkOpen(true)} onImage={() => setImageOpen(true)} />
      <EditorContent editor={editor} />
      <LinkDialog editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
      <MediaPickerModal
        open={imageOpen}
        type="IMAGE"
        onClose={() => setImageOpen(false)}
        onSelect={(m) => {
          editor.chain().focus().setImage({ src: m.url, alt: m.filename.replace(/\.[^.]+$/, '') }).run();
          setImageOpen(false);
        }}
      />
    </div>
  );
}
