import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { AdminBookDTO, InfoItem, MediaRef } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { errorMessage } from '../api/client';
import { publicApi } from '../api/public';
import { Button, ErrorNote, IconButton, PageSpinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { Field, TextArea, TextInput, inputClass } from './fields';
import { MediaSelect } from './MediaPicker';

interface Form {
  title: string;
  originalTitle: string;
  author: string;
  description: string;
  info: InfoItem[];
  cover: MediaRef | null;
  favicon: MediaRef | null;
  defaultBackground: string;
}

const toForm = (b: AdminBookDTO): Form => ({
  title: b.title,
  originalTitle: b.originalTitle ?? '',
  author: b.author,
  description: b.description,
  info: b.info,
  cover: b.cover,
  favicon: b.favicon,
  defaultBackground: b.defaultBackground,
});

export function BookSettingsPage() {
  const bookQ = useAsync(() => adminApi.book(), []);
  if (bookQ.error) {
    return (
      <div className="p-6">
        <ErrorNote>{errorMessage(bookQ.error)}</ErrorNote>
      </div>
    );
  }
  if (!bookQ.data) return <PageSpinner />;
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-6 px-4 pb-20 pt-5">
      <BookForm initial={bookQ.data} />
      <PasswordForm />
    </div>
  );
}

function BookForm({ initial }: { initial: AdminBookDTO }) {
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [saved, setSaved] = useState<Form>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const setInfo = (i: number, patch: Partial<InfoItem>) => set({ info: form.info.map((row, j) => (j === i ? { ...row, ...patch } : row)) });
  const moveInfo = (i: number, d: -1 | 1) => {
    const next = [...form.info];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ info: next });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const book = await adminApi.saveBook({
        title: form.title,
        originalTitle: form.originalTitle.trim() || null,
        author: form.author,
        description: form.description,
        info: form.info.filter((r) => r.label.trim()),
        coverId: form.cover?.id ?? null,
        faviconId: form.favicon?.id ?? null,
        defaultBackground: form.defaultBackground,
      });
      const next = toForm(book);
      setForm(next);
      setSaved(next);
      void publicApi.book(true);
      document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', `/api/favicon?v=${Date.now()}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Книга</h1>
        <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
          {dirty ? 'Сохранить' : 'Сохранено'}
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="aspect-[2/3] overflow-hidden rounded-[7px] bg-raised">
            {form.cover ? <img src={form.cover.url} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-[13px] text-faint">Нет обложки</div>}
          </div>
          <Field label="Обложка (2:3)">
            <MediaSelect type="IMAGE" value={form.cover} onChange={(cover) => set({ cover })} placeholder="Выбрать" />
          </Field>
          <Field label="Иконка сайта (favicon)">
            <MediaSelect type="IMAGE" value={form.favicon} onChange={(favicon) => set({ favicon })} placeholder="По умолчанию" />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Название">
            <TextInput value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required />
          </Field>
          <Field label="Оригинальное / английское название">
            <TextInput value={form.originalTitle} onChange={(e) => set({ originalTitle: e.target.value })} maxLength={300} />
          </Field>
          <Field label="Автор">
            <TextInput value={form.author} onChange={(e) => set({ author: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Описание" hint="пустая строка — новый абзац">
            <TextArea rows={6} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={10000} />
          </Field>
          <Field label="Фон ридера по умолчанию" hint="цвет или CSS-градиент">
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Цвет фона"
                value={/^#[0-9a-f]{6}$/i.test(form.defaultBackground) ? form.defaultBackground : '#101012'}
                onChange={(e) => set({ defaultBackground: e.target.value })}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-line bg-page p-1"
              />
              <input className={inputClass} value={form.defaultBackground} onChange={(e) => set({ defaultBackground: e.target.value })} spellCheck={false} />
            </div>
          </Field>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] text-muted">Информационная карточка</span>
          <span className="text-[12px] text-faint">«Глав» добавляется автоматически</span>
        </div>
        <div className="space-y-2">
          {form.info.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput className="w-40 shrink-0" placeholder="Тип" value={row.label} onChange={(e) => setInfo(i, { label: e.target.value })} maxLength={60} />
              <TextInput placeholder="Роман" value={row.value} onChange={(e) => setInfo(i, { value: e.target.value })} maxLength={300} />
              <IconButton label="Выше" className="size-8" disabled={i === 0} onClick={() => moveInfo(i, -1)}>
                <ChevronUp className="size-4" />
              </IconButton>
              <IconButton label="Ниже" className="size-8" disabled={i === form.info.length - 1} onClick={() => moveInfo(i, 1)}>
                <ChevronDown className="size-4" />
              </IconButton>
              <IconButton label="Удалить строку" className="size-8" onClick={() => set({ info: form.info.filter((_, j) => j !== i) })}>
                <X className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button size="sm" icon={<Plus className="size-3.5" />} disabled={form.info.length >= 30} onClick={() => set({ info: [...form.info, { label: '', value: '' }] })}>
            Добавить строку
          </Button>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [state, setState] = useState<{ loading?: boolean; error?: string; done?: boolean }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setState({ error: 'Пароли не совпадают' });
    if (next.length < 10) return setState({ error: 'Новый пароль — минимум 10 символов' });
    setState({ loading: true });
    try {
      await adminApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setState({ done: true });
    } catch (err) {
      setState({ error: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold">Смена пароля</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Текущий пароль">
          <TextInput type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="Новый пароль">
          <TextInput type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
        </Field>
        <Field label="Повторите">
          <TextInput type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </Field>
      </div>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.done && <p className="text-sm text-success">Пароль изменён. Остальные сессии завершены.</p>}
      <Button type="submit" loading={state.loading}>
        Изменить пароль
      </Button>
    </form>
  );
}
