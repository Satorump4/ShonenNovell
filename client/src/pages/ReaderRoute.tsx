import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Settings2, Volume2, VolumeX } from 'lucide-react';
import type { ChapterDTO, ChapterNavDTO, ChapterSummaryDTO } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { ApiError, errorMessage } from '../api/client';
import { publicApi } from '../api/public';
import { cx, IconButton, PageSpinner, useDismiss } from '../components/ui';
import { chapterLabel } from '../lib/format';
import { getPosition, savePosition } from '../lib/progress';
import { settingsStore, usePrefersReducedMotion, useSettings } from '../lib/settings';
import { useAsync } from '../lib/useAsync';
import { AtmosphereStage } from '../reader/AtmosphereStage';
import { chapterHasMusic, resolveAtmosphere, type BackgroundSpec } from '../reader/atmosphere';
import { audio } from '../reader/audio';
import { DocRenderer, countBlocks } from '../reader/DocRenderer';
import { useActiveScene, useChromeVisibility } from '../reader/hooks';
import { SettingsPanel } from '../reader/SettingsPanel';
import { SoundIntro } from '../reader/SoundIntro';

/**
 * Обёртка ридера. Фон живёт здесь, а не в странице главы: при переходе
 * к следующей главе он плавно перетекает, а не мигает. Музыка — глобальная
 * (AudioDirector), поэтому тоже продолжает играть между главами.
 */
export default function ReaderRoute({ preview = false }: { preview?: boolean }) {
  const params = useParams();
  const key = (preview ? params.id : params.slug) ?? '';
  const settings = useSettings();
  const reduced = usePrefersReducedMotion();
  const book = useAsync(() => publicApi.book(), []);
  const [bg, setBg] = useState<{ spec: BackgroundSpec; duration: number } | null>(null);

  useEffect(() => audio.setEnabled(settings.music), [settings.music]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  // Ушли из ридера — музыка плавно стихает.
  useEffect(() => () => audio.play(null, 900), []);

  const calm = reduced || !settings.animations;
  const onAtmosphere = useCallback(
    (spec: BackgroundSpec, duration: number) => setBg({ spec, duration: calm ? Math.min(duration, 350) : duration }),
    [calm],
  );

  return (
    <>
      {bg && <AtmosphereStage spec={bg.spec} duration={bg.duration} />}
      {settings.brightness < 1 && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-30 bg-black" style={{ opacity: 1 - settings.brightness }} />
      )}
      <ReaderPage
        key={key}
        id={key}
        preview={preview}
        bookTitle={book.data?.title ?? ''}
        defaultBackground={book.data?.defaultBackground ?? '#101012'}
        bookReady={!!book.data || !!book.error}
        onAtmosphere={onAtmosphere}
      />
    </>
  );
}

interface ReaderPageProps {
  id: string;
  preview: boolean;
  bookTitle: string;
  defaultBackground: string;
  bookReady: boolean;
  onAtmosphere: (spec: BackgroundSpec, duration: number) => void;
}

function ReaderPage({ id, preview, bookTitle, defaultBackground, bookReady, onAtmosphere }: ReaderPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const settings = useSettings();
  const audioState = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);

  const chapterQ = useAsync(() => (preview ? publicApi.previewChapter(id) : publicApi.chapter(id)), [id, preview]);
  const chapter = chapterQ.data;
  const listQ = useAsync<ChapterSummaryDTO[]>(() => (preview ? adminApi.chapters() : publicApi.chapters()), [preview]);

  const articleRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [percent, setPercent] = useState(0);
  const [panel, setPanel] = useState<'settings' | 'chapters' | null>(null);
  const chrome = useChromeVisibility(panel !== null);

  const atmosphere = useMemo(
    () => (chapter && bookReady ? resolveAtmosphere(chapter.scenes, defaultBackground) : []),
    [chapter, bookReady, defaultBackground],
  );
  const hasMusic = !!chapter && chapterHasMusic(chapter.scenes);
  const introVisible = hasMusic && !settings.introSeen;

  // ---------- восстановление позиции (до первой отрисовки) ----------
  useLayoutEffect(() => {
    if (!chapter) return;
    document.title = `${chapter.title} — ${bookTitle || 'Книга'}`;
    const root = articleRef.current;
    const find = searchParams.get('find');
    let target: HTMLElement | null = null;

    if (find && root) {
      const needle = find.toLowerCase();
      target = [...root.querySelectorAll<HTMLElement>('[data-block]')].find((el) => el.textContent?.toLowerCase().includes(needle)) ?? null;
      if (target) {
        target.classList.add('find-hit-block');
        window.setTimeout(() => target?.classList.remove('find-hit-block'), 3500);
      }
    } else if (!preview) {
      const pos = getPosition(chapter.slug);
      if (pos && pos.percent > 0.01 && pos.percent < 0.98) {
        target = root?.querySelector<HTMLElement>(`[data-block="${pos.block}"]`) ?? null;
      }
    }
    if (target) {
      const offset = find ? window.innerHeight * 0.3 : 96;
      window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - offset);
    } else {
      window.scrollTo(0, 0);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  // ---------- сцены и атмосфера ----------
  const active = useActiveScene(articleRef, ready ? (chapter?.scenes.length ?? 0) : 0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !atmosphere.length) return;
    if (applied === null) {
      setApplied(active);
      return;
    }
    // Небольшая задержка: при быстрой прокрутке атмосфера не «дёргается».
    const t = window.setTimeout(() => setApplied(active), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, atmosphere.length]);

  useEffect(() => {
    if (applied === null) return;
    const a = atmosphere[Math.min(applied, atmosphere.length - 1)];
    if (!a) return;
    onAtmosphere(a.background, a.transitionMs);
    if (!introVisible) audio.play(a.music, Math.max(a.transitionMs, 300));
  }, [applied, atmosphere, introVisible, onAtmosphere]);

  // ---------- прогресс чтения ----------
  useEffect(() => {
    if (!chapter || !ready) return;
    let frame = 0;
    let saveTimer = 0;

    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      let block = 0;
      for (const el of articleRef.current?.querySelectorAll<HTMLElement>('[data-block]') ?? []) {
        if (el.getBoundingClientRect().bottom > 90) {
          block = Number(el.dataset.block);
          break;
        }
      }
      return { p, block };
    };
    // Последнее измерение: при уходе со страницы DOM главы уже снят,
    // поэтому в cleanup сохраняем то, что было измерено до этого.
    let latest = measure();
    const save = () => {
      if (preview) return;
      savePosition({
        chapterId: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        number: chapter.number,
        volume: chapter.volume,
        percent: latest.p,
        block: latest.block,
        scene: activeRef.current,
        updatedAt: Date.now(),
      });
    };
    const measureAndSave = () => {
      latest = measure();
      save();
    };
    const onScroll = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          latest = measure();
          setPercent(latest.p);
        });
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(measureAndSave, 700);
    };

    setPercent(latest.p);
    save();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', measureAndSave);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(saveTimer);
      save();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', measureAndSave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, ready, preview]);

  // ---------- навигация ----------
  const linkTo = useCallback((c: ChapterNavDTO | ChapterSummaryDTO) => (preview ? `/preview/${c.id}` : `/read/${c.slug}`), [preview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' && chapter?.prev) navigate(linkTo(chapter.prev));
      if (e.key === 'ArrowRight' && chapter?.next) navigate(linkTo(chapter.next));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, navigate, linkTo]);

  const toggleMusic = () => {
    const on = !settings.music;
    settingsStore.set({ music: on, introSeen: true });
    audio.setEnabled(on);
    if (on) audio.unlock();
  };

  // Тап по тексту на телефоне показывает/прячет панели.
  const onArticleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    chrome.toggle();
  };

  // ---------- рендер ----------
  if (chapterQ.error) {
    const status = chapterQ.error instanceof ApiError ? chapterQ.error.status : 0;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg">
          {status === 404 ? 'Глава не найдена' : status === 401 ? 'Предпросмотр доступен только после входа в админку' : 'Не удалось загрузить главу'}
        </p>
        {status !== 404 && status !== 401 && <p className="text-sm text-faint">{errorMessage(chapterQ.error)}</p>}
        <div className="flex gap-2">
          {status === 401 && (
            <Link to="/admin" className="rounded-md bg-accent px-4 py-2 text-sm text-white">
              Войти
            </Link>
          )}
          <Link to="/" className="rounded-md bg-raised px-4 py-2 text-sm">
            К оглавлению
          </Link>
        </div>
      </div>
    );
  }

  if (!chapter) return <PageSpinner />;

  let blockOffset = 0;
  const chapters = listQ.data ?? [];
  const chromeClass = cx('transition-opacity duration-300', chrome.visible ? 'opacity-100' : 'pointer-events-none opacity-0');

  return (
    <div
      className={settings.font === 'serif' ? 'font-serif' : 'font-sans'}
      style={{ ['--reader-size' as string]: `${settings.fontSize}px`, ['--reader-lh' as string]: String(settings.lineHeight) }}
    >
      {/* Верхняя панель */}
      <header className={cx('fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-[#141416]/90 pt-[env(safe-area-inset-top)] font-sans', chromeClass)}>
        <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-1 px-2 sm:px-4">
          <Link
            to={preview ? `/admin/chapters/${chapter.id}` : '/'}
            className="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-muted hover:bg-white/5 hover:text-fg"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="hidden max-w-[220px] truncate sm:inline">{preview ? 'В редактор' : bookTitle}</span>
          </Link>

          <ChapterPicker
            open={panel === 'chapters'}
            onOpenChange={(o) => setPanel(o ? 'chapters' : null)}
            chapter={chapter}
            chapters={chapters}
            linkTo={linkTo}
          />

          <div className="ml-auto flex items-center gap-1">
            {preview && (
              <span className="mr-1 hidden rounded bg-amber-500/15 px-2 py-0.5 text-[12px] text-amber-300 sm:inline">
                Предпросмотр{chapter.published ? '' : ' · черновик'}
              </span>
            )}
            <IconButton label={settings.music ? 'Выключить музыку' : 'Включить музыку'} onClick={toggleMusic} active={settings.music && hasMusic}>
              {settings.music ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />}
            </IconButton>
            <SettingsButton open={panel === 'settings'} onOpenChange={(o) => setPanel(o ? 'settings' : null)} />
          </div>
        </div>
      </header>

      {/* Текст главы */}
      <main className="px-5 sm:px-8" onClick={onArticleClick}>
        <article ref={articleRef} className="mx-auto pb-16" style={{ maxWidth: settings.width }}>
          <header className="pb-10 pt-24 text-center font-sans sm:pt-28">
            <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-white/45">
              {chapter.volume != null && <>Том {chapter.volume} · </>}Глава {chapter.number}
            </p>
            <h1 className="mt-4 text-[28px] font-semibold leading-tight text-[#f2f1ee] sm:text-[36px]">{chapter.title}</h1>
            <div className="mx-auto mt-8 h-px w-16 bg-white/20" />
          </header>

          <div className="book-text">
            {chapter.scenes.map((scene) => {
              const offset = blockOffset;
              blockOffset += countBlocks(scene.content);
              return (
                <section key={scene.id} data-scene={scene.id}>
                  <DocRenderer doc={scene.content} blockOffset={offset} />
                </section>
              );
            })}
          </div>
        </article>

        <ChapterEnd chapter={chapter} linkTo={linkTo} preview={preview} />
      </main>

      {/* Нижняя панель */}
      <div className={cx('fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] font-sans', chromeClass)}>
        <div className="mx-auto flex h-12 max-w-[640px] items-center justify-between gap-2 px-3">
          <NavButton to={chapter.prev && linkTo(chapter.prev)} direction="prev" />
          <span className="rounded-full bg-black/40 px-3 py-1 text-[13px] tabular-nums text-white/70">{Math.round(percent * 100)}%</span>
          <NavButton to={chapter.next && linkTo(chapter.next)} direction="next" />
        </div>
      </div>
      <div aria-hidden className="fixed inset-x-0 bottom-0 z-40 h-[2px] bg-white/5">
        <div className="h-full bg-accent/70" style={{ width: `${percent * 100}%` }} />
      </div>

      {audioState.waiting && settings.music && settings.introSeen && hasMusic && (
        <button
          onClick={() => audio.unlock()}
          className="fade-in fixed bottom-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 font-sans text-[13px] text-fg shadow-xl"
        >
          <Volume2 className="size-4 text-accent" /> Включить музыку
        </button>
      )}

      {introVisible && <SoundIntro />}
    </div>
  );
}

function NavButton({ to, direction }: { to: string | null; direction: 'prev' | 'next' }) {
  const label = direction === 'prev' ? 'Предыдущая глава' : 'Следующая глава';
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  const cls = 'flex size-10 items-center justify-center rounded-full bg-black/40 text-white/80';
  if (!to) return <span className={cx(cls, 'opacity-30')} aria-hidden><Icon className="size-5" /></span>;
  return (
    <Link to={to} aria-label={label} title={label} className={cx(cls, 'hover:bg-black/60 hover:text-white')}>
      <Icon className="size-5" />
    </Link>
  );
}

function ChapterEnd({ chapter, linkTo, preview }: { chapter: ChapterDTO; linkTo: (c: ChapterNavDTO) => string; preview: boolean }) {
  const btn = 'flex min-w-0 flex-1 flex-col rounded-lg border border-white/10 bg-black/25 px-4 py-3 transition-colors hover:border-white/25 hover:bg-black/40';
  return (
    <nav className="mx-auto max-w-[700px] pb-[calc(7rem+env(safe-area-inset-bottom))] font-sans">
      <div className="mb-8 h-px bg-white/10" />
      <div className="flex gap-3">
        {chapter.prev ? (
          <Link to={linkTo(chapter.prev)} className={btn}>
            <span className="text-[12px] text-white/45">← Назад</span>
            <span className="truncate text-sm text-white/85">{chapter.prev.title}</span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
        {chapter.next ? (
          <Link to={linkTo(chapter.next)} className={cx(btn, 'items-end text-right')}>
            <span className="text-[12px] text-white/45">Далее →</span>
            <span className="max-w-full truncate text-sm text-white/85">{chapter.next.title}</span>
          </Link>
        ) : (
          <div className="flex flex-1 items-center justify-end text-right text-[13px] text-white/45">Это последняя опубликованная глава</div>
        )}
      </div>
      {!preview && (
        <div className="mt-6 text-center">
          <Link to="/" className="text-[13px] text-white/50 hover:text-white">
            К оглавлению
          </Link>
        </div>
      )}
    </nav>
  );
}

function ChapterPicker({
  open,
  onOpenChange,
  chapter,
  chapters,
  linkTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: ChapterDTO;
  chapters: ChapterSummaryDTO[];
  linkTo: (c: ChapterSummaryDTO) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useDismiss(ref, open, () => onOpenChange(false));

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' });
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => onOpenChange(!open)}
        className="flex h-9 min-w-0 max-w-[60vw] items-center gap-1.5 rounded-md px-2 text-sm hover:bg-white/5 sm:max-w-[420px]"
      >
        <span className="truncate">
          <span className="text-muted">{chapterLabel(chapter)}</span>
          <span className="hidden text-fg sm:inline"> · {chapter.title}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-faint" />
      </button>
      {open && (
        <div className="fade-in fixed inset-x-2 top-[calc(3.25rem+env(safe-area-inset-top))] z-50 overflow-hidden sm:absolute sm:inset-x-auto sm:left-0 sm:top-11 sm:w-96 rounded-lg border border-line bg-panel shadow-2xl">
          <ul ref={listRef} className="scrollbar-thin max-h-[60vh] overflow-y-auto py-1">
            {chapters.map((c) => {
              const current = c.id === chapter.id;
              return (
                <li key={c.id}>
                  <Link
                    to={linkTo(c)}
                    onClick={() => onOpenChange(false)}
                    data-current={current || undefined}
                    className={cx('block px-4 py-2 text-sm', current ? 'bg-accent/10 text-accent' : 'text-fg/90 hover:bg-white/5')}
                  >
                    <span className={current ? '' : 'text-muted'}>{chapterLabel(c)}</span> — {c.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SettingsButton({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => onOpenChange(false));
  return (
    <div ref={ref} className="relative">
      <IconButton label="Настройки чтения" active={open} onClick={() => onOpenChange(!open)}>
        <Settings2 className="size-[18px]" />
      </IconButton>
      {open && (
        <div className="fade-in fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-50 max-h-[80dvh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-11 sm:w-80">
          <SettingsPanel />
        </div>
      )}
    </div>
  );
}
