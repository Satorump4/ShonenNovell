import { useEffect, useRef, useState } from 'react';
import { Music, Pause, Play, Upload, X } from 'lucide-react';
import type { MediaDTO, MediaRef, MediaType } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { errorMessage } from '../api/client';
import { Button, cx, ErrorNote, Modal, Spinner } from '../components/ui';
import { formatSize } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export const ACCEPT: Record<MediaType | 'ALL', string> = {
  IMAGE: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
  AUDIO: 'audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a',
  ALL: 'image/jpeg,image/png,image/webp,image/gif,image/avif,audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a',
};

/** Кнопка загрузки файлов с прогрессом. */
export function UploadButton({ accept, onUploaded, multiple = true }: { accept: string; onUploaded: (m: MediaDTO) => void; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      setProgress({ name: file.name, value: 0 });
      try {
        onUploaded(await adminApi.upload(file, (v) => setProgress({ name: file.name, value: v })));
      } catch (err) {
        setError(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setProgress(null);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => upload(e.target.files)} />
      <Button variant="primary" icon={<Upload className="size-4" />} loading={!!progress} onClick={() => input.current?.click()}>
        {progress ? `${Math.round(progress.value * 100)}%` : 'Загрузить'}
      </Button>
      {progress && <p className="max-w-64 truncate text-[12px] text-faint">{progress.name}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/** Одна кнопка «прослушать» — звук останавливается при повторном нажатии. */
export function AudioPreview({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => ref.current?.pause(), []);
  const toggle = () => {
    if (!ref.current) {
      ref.current = new Audio(url);
      ref.current.onended = () => setPlaying(false);
      ref.current.onpause = () => setPlaying(false);
      ref.current.onplay = () => setPlaying(true);
    }
    if (ref.current.paused) void ref.current.play().catch(() => setPlaying(false));
    else ref.current.pause();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? 'Пауза' : 'Прослушать'}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-fg hover:bg-white/20"
    >
      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </button>
  );
}

export function MediaPickerModal({
  open,
  type,
  onClose,
  onSelect,
}: {
  open: boolean;
  type: MediaType;
  onClose: () => void;
  onSelect: (media: MediaDTO) => void;
}) {
  const list = useAsync(() => (open ? adminApi.media(type) : Promise.resolve([] as MediaDTO[])), [open, type]);
  const items = list.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title={type === 'IMAGE' ? 'Выбрать изображение' : 'Выбрать трек'} width="max-w-3xl">
      <div className="space-y-4 p-4">
        <UploadButton
          accept={ACCEPT[type]}
          multiple={false}
          onUploaded={(m) => {
            if (m.type === type) onSelect(m);
            else list.reload();
          }}
        />
        {list.loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : list.error ? (
          <ErrorNote>{errorMessage(list.error)}</ErrorNote>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">В медиатеке пока нет {type === 'IMAGE' ? 'изображений' : 'треков'}.</p>
        ) : type === 'IMAGE' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map((m) => (
              <button key={m.id} onClick={() => onSelect(m)} className="group overflow-hidden rounded-md border border-line text-left hover:border-accent">
                <img src={m.url} alt="" loading="lazy" className="aspect-[4/3] w-full bg-raised object-cover" />
                <span className="block truncate px-2 py-1.5 text-[12px] text-muted group-hover:text-fg">{m.filename}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {items.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <AudioPreview url={m.url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.filename}</p>
                  <p className="text-[12px] text-faint">{formatSize(m.size)}</p>
                </div>
                <Button size="sm" onClick={() => onSelect(m)}>
                  Выбрать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** Поле выбора файла из медиатеки (для сцены или настроек книги). */
export function MediaSelect({
  type,
  value,
  onChange,
  placeholder,
}: {
  type: MediaType;
  value: MediaRef | null;
  onChange: (media: MediaRef | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {value && type === 'AUDIO' && <AudioPreview key={value.url} url={value.url} />}
      {value && type === 'IMAGE' && <img src={value.url} alt="" className="size-9 shrink-0 rounded object-cover" />}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-page px-3 text-left text-sm hover:border-white/25',
          !value && 'text-faint',
        )}
      >
        {!value && type === 'AUDIO' && <Music className="size-4 shrink-0" />}
        <span className="truncate">{value?.filename ?? placeholder ?? 'Выбрать…'}</span>
      </button>
      {value && (
        <button type="button" aria-label="Убрать" onClick={() => onChange(null)} className="rounded p-1.5 text-faint hover:bg-white/10 hover:text-fg">
          <X className="size-4" />
        </button>
      )}
      <MediaPickerModal
        open={open}
        type={type}
        onClose={() => setOpen(false)}
        onSelect={(m) => {
          onChange({ id: m.id, url: m.url, filename: m.filename });
          setOpen(false);
        }}
      />
    </div>
  );
}
