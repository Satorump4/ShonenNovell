import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { Check, Eye, Plus, Save, Trash2 } from 'lucide-react';
import type { ChapterDTO, SceneDTO } from '../../../shared/types';
import { adminApi, type ChapterUpdate, type SceneUpdate } from '../api/admin';
import { errorMessage } from '../api/client';
import { publicApi } from '../api/public';
import { Button, ConfirmDialog, ErrorNote, PageSpinner, Toggle } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { Field, TextInput } from './fields';
import { SceneCard, type SceneDraft } from './SceneCard';

interface Meta {
  title: string;
  slug: string;
  volume: string;
  number: string;
}

const metaOf = (c: ChapterDTO): Meta => ({ title: c.title, slug: c.slug, volume: c.volume == null ? '' : String(c.volume), number: c.number });

const sceneUpdate = (s: SceneDraft): SceneUpdate => ({
  title: s.title,
  content: s.content,
  musicMode: s.musicMode,
  musicId: s.music?.id ?? null,
  volume: s.volume,
  background: s.background?.trim() ? s.background.trim() : null,
  backgroundImageId: s.backgroundImage?.id ?? null,
  backgroundDim: s.backgroundDim,
  transitionMs: s.transitionMs,
});

export function ChapterEditor({ onChanged }: { onChanged: () => void }) {
  const { id = '' } = useParams();
  const chapterQ = useAsync(() => adminApi.chapter(id), [id]);
  const bookQ = useAsync(() => publicApi.book(), []);

  if (chapterQ.error) {
    return (
      <div className="p-6">
        <ErrorNote>{errorMessage(chapterQ.error)}</ErrorNote>
      </div>
    );
  }
  if (!chapterQ.data || chapterQ.data.id !== id) return <PageSpinner />;
  return <Editor key={id} initial={chapterQ.data} defaultBackground={bookQ.data?.defaultBackground ?? '#101012'} onChanged={onChanged} />;
}

function Editor({ initial, defaultBackground, onChanged }: { initial: ChapterDTO; defaultBackground: string; onChanged: () => void }) {
  const navigate = useNavigate();
  const [chapter, setChapter] = useState(initial);
  const [meta, setMeta] = useState<Meta>(() => metaOf(initial));
  const [scenes, setScenes] = useState<SceneDraft[]>(() => initial.scenes.map((s) => ({ ...s, dirty: false })));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'chapter' } | { kind: 'scene'; scene: SceneDraft } | null>(null);
  const [busy, setBusy] = useState(false);

  const metaDirty = JSON.stringify(meta) !== JSON.stringify(metaOf(chapter));
  const dirty = metaDirty || scenes.some((s) => s.dirty);

  // ---------- сохранение ----------
  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [];
      if (metaDirty) {
        const volume = meta.volume.trim() === '' ? null : Number(meta.volume);
        if (volume !== null && (!Number.isInteger(volume) || volume < 0)) throw new Error('Том должен быть целым числом');
        const update: ChapterUpdate = { title: meta.title.trim(), slug: meta.slug.trim(), number: meta.number.trim(), volume };
        tasks.push(
          adminApi.updateChapter(chapter.id, update).then((c) => {
            setChapter(c);
            setMeta(metaOf(c));
          }),
        );
      }
      for (const scene of scenes.filter((s) => s.dirty)) {
        tasks.push(
          adminApi.updateScene(scene.id, sceneUpdate(scene)).then((saved) =>
            // Снимаем пометку, только если за время запроса сцену больше не меняли
            // (каждая правка создаёт новый объект сцены).
            setScenes((prev) => prev.map((s) => (s === scene ? { ...s, ...saved, content: s.content, dirty: false } : s))),
          ),
        );
      }
      const results = await Promise.allSettled(tasks);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
      setSavedAt(Date.now());
      if (metaDirty) onChanged();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [chapter.id, meta, metaDirty, scenes, onChanged]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  // Предупреждение о несохранённых изменениях.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // ---------- публикация ----------
  const togglePublished = async (published: boolean) => {
    setPublishing(true);
    setError(null);
    try {
      const c = await adminApi.updateChapter(chapter.id, { published });
      setChapter((prev) => ({ ...prev, published: c.published, publishedAt: c.publishedAt }));
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  };

  // ---------- предпросмотр ----------
  const preview = async () => {
    const url = `/preview/${chapter.id}`;
    if (!dirty) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    // Окно открываем сразу (иначе браузер заблокирует всплывающее окно), адрес — после сохранения.
    const win = window.open('about:blank', '_blank');
    const ok = await save();
    if (win) {
      if (ok) win.location.href = url;
      else win.close();
    }
  };

  // ---------- сцены ----------
  const updateScene = (sceneId: string, patch: Partial<SceneDTO>) =>
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...patch, dirty: true } : s)));

  const addScene = async () => {
    setBusy(true);
    setError(null);
    try {
      const scene = await adminApi.createScene(chapter.id);
      setScenes((prev) => [...prev, { ...scene, dirty: false }]);
      onChanged();
      requestAnimationFrame(() => document.getElementById(`scene-${scene.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const moveScene = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    setScenes(next);
    try {
      await adminApi.reorderScenes(chapter.id, next.map((s) => s.id));
    } catch (err) {
      setError(errorMessage(err));
      setScenes(scenes);
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'chapter') {
        await adminApi.deleteChapter(chapter.id);
        setConfirm(null);
        onChanged();
        // Изменения удалённой главы сохранять уже некуда — уходим без вопроса.
        leaving.current = true;
        navigate('/admin/chapters', { replace: true });
        return;
      }
      await adminApi.deleteScene(confirm.scene.id);
      setScenes((prev) => prev.filter((s) => s.id !== confirm.scene.id));
      setConfirm(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  // Фон «по наследству» для превью в каждой сцене.
  const inherited = useMemo(() => {
    let bg = defaultBackground;
    return scenes.map((s) => {
      const current = bg;
      if (s.background) bg = s.background;
      return current;
    });
  }, [scenes, defaultBackground]);

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-5">
      {/* Шапка главы */}
      <div className="space-y-4 rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            placeholder="Название главы"
            maxLength={200}
            className="h-10 min-w-0 flex-1 basis-64 rounded-md bg-transparent px-2 text-xl font-semibold outline-none placeholder:text-faint hover:bg-white/5 focus:bg-white/5"
          />
          <div className="flex items-center gap-2">
            <Button icon={<Eye className="size-4" />} onClick={preview}>
              Предпросмотр
            </Button>
            <Button variant="primary" icon={saving ? undefined : savedAt && !dirty ? <Check className="size-4" /> : <Save className="size-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
              {dirty ? 'Сохранить' : 'Сохранено'}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[100px_120px_minmax(0,1fr)]">
          <Field label="Том">
            <TextInput inputMode="numeric" value={meta.volume} onChange={(e) => setMeta({ ...meta, volume: e.target.value.replace(/[^\d]/g, '') })} placeholder="—" />
          </Field>
          <Field label="Номер главы">
            <TextInput value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} maxLength={20} />
          </Field>
          <Field label="Адрес" hint="/read/…">
            <TextInput value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value.toLowerCase() })} maxLength={100} spellCheck={false} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <label className="flex items-center gap-3 text-sm">
            <Toggle label="Опубликована" checked={chapter.published} onChange={(v) => void togglePublished(v)} />
            {publishing ? 'Сохраняю…' : chapter.published ? 'Опубликована — видна читателям' : 'Черновик — видна только вам'}
          </label>
          <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm({ kind: 'chapter' })}>
            Удалить главу
          </Button>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      {/* Сцены */}
      <div className="mt-5 space-y-4">
        {scenes.map((scene, i) => (
          <div key={scene.id} id={`scene-${scene.id}`} className="scroll-mt-16">
            <SceneCard
              scene={scene}
              index={i}
              total={scenes.length}
              inheritedBackground={inherited[i]}
              onChange={(patch) => updateScene(scene.id, patch)}
              onMove={(d) => void moveScene(i, d)}
              onDelete={() => setConfirm({ kind: 'scene', scene })}
            />
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void addScene()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Plus className="size-4" /> Добавить сцену
        </button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        loading={busy}
        title={confirm?.kind === 'chapter' ? 'Удалить главу?' : 'Удалить сцену?'}
        message={
          confirm?.kind === 'chapter' ? (
            <>
              Глава «{chapter.title}» и все её сцены будут удалены без возможности восстановления.
            </>
          ) : (
            <>Сцена «{confirm?.kind === 'scene' ? confirm.scene.title || 'без названия' : ''}» и её текст будут удалены без возможности восстановления.</>
          )
        }
        onConfirm={() => void doDelete()}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Несохранённые изменения"
        message="В главе есть несохранённые изменения. Уйти без сохранения?"
        confirmLabel="Уйти без сохранения"
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
