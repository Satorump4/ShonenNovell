import { useState, type DragEvent } from 'react';
import { Copy, Music, Trash2 } from 'lucide-react';
import type { MediaDTO, MediaType } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { errorMessage } from '../api/client';
import { Button, ConfirmDialog, cx, ErrorNote, IconButton, Spinner } from '../components/ui';
import { formatDate, formatSize } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Segmented } from './fields';
import { ACCEPT, AudioPreview, UploadButton } from './MediaPicker';

type Filter = 'ALL' | MediaType;

export function MediaLibraryPage() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const list = useAsync(() => adminApi.media(filter === 'ALL' ? undefined : filter), [filter]);
  const [toDelete, setToDelete] = useState<{ media: MediaDTO; usage: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropProgress, setDropProgress] = useState<string | null>(null);

  const add = (m: MediaDTO) => {
    if (filter === 'ALL' || filter === m.type) list.setData((prev) => [m, ...(prev ?? [])]);
  };

  const askDelete = async (media: MediaDTO) => {
    setError(null);
    try {
      const u = await adminApi.mediaUsage(media.id);
      const parts = [
        u.scenes ? `в настройках сцен: ${u.scenes}` : '',
        u.book ? 'как обложка или иконка книги' : '',
        u.inText ? `в тексте сцен: ${u.inText}` : '',
      ].filter(Boolean);
      setToDelete({ media, usage: parts.length ? `Файл используется ${parts.join(', ')}. Эти места останутся без него.` : 'Файл нигде не используется.' });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adminApi.deleteMedia(toDelete.media.id);
      list.setData((prev) => (prev ?? []).filter((m) => m.id !== toDelete.media.id));
      setToDelete(null);
    } catch (err) {
      setError(errorMessage(err));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const copy = async (m: MediaDTO) => {
    const url = new URL(m.url, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(m.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt('Скопируйте адрес файла:', url);
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setError(null);
    for (const file of Array.from(e.dataTransfer.files)) {
      setDropProgress(file.name);
      try {
        add(await adminApi.upload(file));
      } catch (err) {
        setError(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setDropProgress(null);
  };

  const items = list.data ?? [];

  return (
    <div
      className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Медиатека</h1>
          <p className="mt-1 text-[13px] text-faint">
            MP3, OGG, WAV, M4A и изображения (JPEG, PNG, WebP, GIF, AVIF). Изображения автоматически сжимаются в WebP. Можно перетащить файлы на страницу.
          </p>
        </div>
        <UploadButton accept={ACCEPT.ALL} onUploaded={add} />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ['ALL', 'Все'],
            ['IMAGE', 'Изображения'],
            ['AUDIO', 'Аудио'],
          ]}
        />
        {dropProgress && (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner className="size-4" /> {dropProgress}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className={cx('mt-4 rounded-lg border border-line bg-panel transition-colors', dragOver && 'border-accent bg-accent/5')}>
        {list.loading && !list.data ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : list.error ? (
          <div className="p-4">
            <ErrorNote>{errorMessage(list.error)}</ErrorNote>
          </div>
        ) : items.length === 0 ? (
          <p className="py-14 text-center text-sm text-faint">Файлов пока нет. Загрузите музыку или изображения.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                {m.type === 'IMAGE' ? (
                  <a href={m.url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={m.url} alt="" loading="lazy" className="size-12 rounded object-cover" />
                  </a>
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded bg-white/5">
                    <Music className="size-5 text-faint" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.filename}</p>
                  <p className="truncate text-[12px] text-faint">
                    {m.type === 'IMAGE' ? 'Изображение' : 'Аудио'} · {formatSize(m.size)}
                    {m.width && m.height ? ` · ${m.width}×${m.height}` : ''} · {formatDate(m.createdAt)}
                  </p>
                  <p className="hidden truncate font-mono text-[11px] text-faint/80 sm:block">{m.url}</p>
                </div>
                {m.type === 'AUDIO' && <AudioPreview url={m.url} />}
                <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => void copy(m)}>
                  <span className="hidden sm:inline">{copied === m.id ? 'Скопировано' : 'URL'}</span>
                </Button>
                <IconButton label="Удалить файл" className="size-8 hover:!text-danger" onClick={() => void askDelete(m)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        loading={deleting}
        title="Удалить файл?"
        message={
          <>
            <b className="text-fg">{toDelete?.media.filename}</b> будет удалён из хранилища. {toDelete?.usage}
          </>
        }
        onConfirm={() => void doDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

