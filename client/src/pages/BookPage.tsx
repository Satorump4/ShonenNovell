import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUpDown, BookOpen, Check, ChevronDown, Download, Eye, EyeOff, Plus, Star } from 'lucide-react';
import type { BookDTO, ChapterSummaryDTO } from '../../../shared/types';
import { errorMessage } from '../api/client';
import { publicApi } from '../api/public';
import { Navbar } from '../components/Navbar';
import { Button, cx, ErrorNote, Modal, useDismiss } from '../components/ui';
import { chapterLabel, clientId, formatDate, plural } from '../lib/format';
import { getLastPosition, getPositions, getReadIds } from '../lib/progress';
import { SHELF_LABELS, shelfStore, useShelf, type ShelfStatus } from '../lib/shelf';
import { useAsync } from '../lib/useAsync';

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')} K` : String(n);
}

// ---------- Левая колонка ----------

function Cover({ book }: { book: BookDTO }) {
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[7px] bg-raised">
      {book.coverUrl ? (
        <img src={book.coverUrl} alt={`Обложка: ${book.title}`} className="size-full object-cover" fetchPriority="high" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
          <BookOpen className="size-10 text-faint" />
          <span className="text-sm font-medium text-muted">{book.title}</span>
        </div>
      )}
    </div>
  );
}

function ShelfButton() {
  const { status } = useShelf();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const choose = (s: ShelfStatus | null) => {
    shelfStore.set({ status: s });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex">
      <button
        onClick={() => choose(status ? status : 'planned')}
        className="flex h-10 flex-1 items-center gap-2 rounded-l-md border border-line bg-raised px-3 text-sm text-fg hover:bg-hover"
      >
        {status ? <Check className="size-4 text-accent" /> : <Plus className="size-4" />}
        {status ? SHELF_LABELS[status] : 'Добавить в планы'}
      </button>
      <button
        aria-label="Выбрать список"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-r-md border border-l-0 border-line bg-raised text-muted hover:bg-hover hover:text-fg"
      >
        <ChevronDown className="size-4" />
      </button>
      {open && (
        <div className="fade-in absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-md border border-line bg-panel py-1 shadow-2xl">
          {(Object.keys(SHELF_LABELS) as ShelfStatus[]).map((s) => (
            <button key={s} onClick={() => choose(s)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5">
              {SHELF_LABELS[s]}
              {status === s && <Check className="size-4 text-accent" />}
            </button>
          ))}
          {status && (
            <button onClick={() => choose(null)} className="w-full border-t border-line px-3 py-2 text-left text-sm text-muted hover:bg-white/5">
              Убрать из списков
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCard({ book }: { book: BookDTO }) {
  const rows = [...book.info];
  rows.splice(Math.min(2, rows.length), 0, { label: 'Глав', value: String(book.chapterCount) });
  return (
    <dl className="space-y-3 rounded-lg bg-panel px-4 py-4">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`}>
          <dt className="text-[13px] text-faint">{row.label}</dt>
          <dd className="mt-0.5 text-sm text-fg">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Оценка ----------

function RatingDialog({ open, onClose, onRated }: { open: boolean; onClose: () => void; onRated: (r: BookDTO['rating']) => void }) {
  const { rating } = useShelf();
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = async (value: number) => {
    setSaving(true);
    setError(null);
    try {
      onRated(await publicApi.rate(clientId(), value));
      shelfStore.set({ rating: value });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const shown = hover || rating || 0;
  return (
    <Modal open={open} onClose={onClose} title="Оценить книгу">
      <div className="space-y-4 p-4">
        <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              disabled={saving}
              onMouseEnter={() => setHover(v)}
              onFocus={() => setHover(v)}
              onClick={() => rate(v)}
              aria-label={`Оценка ${v}`}
              className="p-0.5"
            >
              <Star className={cx('size-6 sm:size-7', v <= shown ? 'fill-star text-star' : 'text-faint')} />
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-muted">{shown ? `${shown} из 10` : 'Выберите оценку'}</p>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  );
}

// ---------- Список глав ----------

function ChapterList({ chapters, highlightId }: { chapters: ChapterSummaryDTO[]; highlightId: string | null }) {
  const readIds = useMemo(getReadIds, []);
  const positions = useMemo(getPositions, []);

  return (
    <ul>
      {chapters.map((c) => {
        const read = readIds.has(c.id);
        const pos = positions[c.slug];
        const inProgress = !read && pos && pos.percent > 0.02;
        return (
          <li key={c.id} id={`ch-${c.id}`}>
            <Link
              to={`/read/${c.slug}`}
              className={cx(
                'flex min-h-10 items-center gap-3 border-b border-line/60 px-1 py-2 transition-colors hover:bg-white/[0.035] sm:px-2',
                highlightId === c.id && 'bg-accent/10',
              )}
            >
              {read ? (
                <Eye className="size-4 shrink-0 text-accent/80" aria-label="Прочитано" />
              ) : (
                <EyeOff className="size-4 shrink-0 text-faint" aria-label="Не прочитано" />
              )}
              <span className="min-w-0 flex-1 text-[14px] leading-snug">
                <span className="text-fg/90">{chapterLabel(c)}</span>
                <span className="text-muted"> - {c.title}</span>
              </span>
              {inProgress && <span className="shrink-0 text-[12px] tabular-nums text-accent">{Math.round(pos.percent * 100)}%</span>}
              <span className="shrink-0 text-[13px] tabular-nums text-date">{formatDate(c.publishedAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Страница ----------

export default function BookPage() {
  const book = useAsync(() => publicApi.book(), []);
  const chapters = useAsync(() => publicApi.chapters(), []);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'about' ? 'about' : 'chapters';
  const [descending, setDescending] = useState(true);
  const [rateOpen, setRateOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const last = useMemo(getLastPosition, []);
  const readCount = useMemo(() => getReadIds().size, []);

  useEffect(() => {
    if (book.data) document.title = book.data.title;
  }, [book.data]);
  // Возврат из ридера: страница книги открывается сверху, а не на позиции чтения.
  useEffect(() => window.scrollTo(0, 0), []);

  const list = chapters.data ?? [];
  const sorted = useMemo(() => (descending ? [...list].reverse() : list), [list, descending]);
  const first = list[0];
  // «Продолжить»: последняя открытая глава, а если она дочитана — следующая.
  const lastIndex = last ? list.findIndex((c) => c.slug === last.slug) : -1;
  let continueChapter: ChapterSummaryDTO | undefined = lastIndex >= 0 ? list[lastIndex] : undefined;
  let continuePercent = last?.percent ?? 0;
  if (continueChapter && continuePercent >= 0.98 && list[lastIndex + 1]) {
    continueChapter = list[lastIndex + 1];
    continuePercent = 0;
  }

  const jumpToCurrent = () => {
    const target = continueChapter ?? list.find((c) => !getReadIds().has(c.id)) ?? first;
    if (!target) return;
    document.getElementById(`ch-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlight(target.id);
    window.setTimeout(() => setHighlight(null), 2200);
  };

  if (book.error) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <ErrorNote>Не удалось загрузить книгу: {errorMessage(book.error)}</ErrorNote>
        </div>
      </>
    );
  }

  const b = book.data;

  return (
    <>
      <Navbar title={b?.title} />
      <main className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 md:pt-6">
        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Левая колонка */}
          <aside className="mx-auto w-full max-w-[260px] space-y-3 md:mx-0 md:max-w-none">
            {b ? <Cover book={b} /> : <div className="aspect-[2/3] animate-pulse rounded-[7px] bg-panel" />}

            {continueChapter ? (
              <Link
                to={`/read/${continueChapter.slug}`}
                className="flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <BookOpen className="size-4" />
                <span className="flex-1 truncate">Продолжить чтение</span>
                <span className="text-[12px] font-normal text-white/75">
                  Гл. {continueChapter.number} · {Math.round(continuePercent * 100)}%
                </span>
              </Link>
            ) : (
              <Link
                to={first ? `/read/${first.slug}` : '#'}
                aria-disabled={!first}
                className={cx(
                  'flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover',
                  !first && 'pointer-events-none opacity-50',
                )}
              >
                <BookOpen className="size-4" />
                <span className="flex-1">Начать читать</span>
                <span className="text-[12px] font-normal text-white/75">
                  {readCount} / {list.length}
                </span>
              </Link>
            )}
            {continueChapter && first && (
              <Link to={`/read/${first.slug}`} className="block text-center text-[13px] text-muted hover:text-fg">
                Начать с первой главы
              </Link>
            )}

            <ShelfButton />
            {b && <InfoCard book={b} />}
          </aside>

          {/* Правая колонка */}
          <section className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 rounded-lg bg-panel px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h1 className="text-[22px] font-semibold leading-tight sm:text-[26px]">{b?.title ?? ' '}</h1>
                {b?.originalTitle && <p className="mt-1 truncate text-[15px] text-muted">{b.originalTitle}</p>}
                {b?.author && <p className="mt-2 text-[13px] text-faint">Автор: <span className="text-muted">{b.author}</span></p>}
              </div>
              <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                <div className="flex items-baseline gap-2">
                  <Star className="size-5 self-center fill-star text-star" />
                  <span className="text-[22px] font-semibold tabular-nums">{b?.rating.average?.toFixed(2) ?? '—'}</span>
                  <span className="text-sm text-muted">{formatCount(b?.rating.count ?? 0)}</span>
                </div>
                <Button size="sm" icon={<Star className="size-3.5" />} onClick={() => setRateOpen(true)}>
                  Оценить
                </Button>
              </div>
            </div>

            <div id="chapters" className="scroll-mt-16 rounded-lg bg-panel">
              <div role="tablist" className="flex gap-5 border-b border-line px-4 sm:px-5">
                {(
                  [
                    ['about', 'О книге'],
                    ['chapters', 'Главы'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setParams(key === 'chapters' ? {} : { tab: key }, { replace: true })}
                    className={cx(
                      '-mb-px border-b-2 py-3 text-[15px] transition-colors',
                      tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg',
                    )}
                  >
                    {label}
                    {key === 'chapters' && list.length > 0 && <span className="ml-1.5 text-[13px] text-faint">{list.length}</span>}
                  </button>
                ))}
              </div>

              {tab === 'about' ? (
                <div className="space-y-4 px-4 py-5 sm:px-5">
                  {b?.description ? (
                    b.description
                      .split(/\n{2,}/)
                      .map((para, i) => (
                        <p key={i} className="whitespace-pre-line text-[15px] leading-relaxed text-fg/90">
                          {para}
                        </p>
                      ))
                  ) : (
                    <p className="text-sm text-faint">Описание пока не добавлено.</p>
                  )}
                  {b && (
                    <p className="text-sm text-muted">
                      {b.chapterCount} {plural(b.chapterCount, ['глава', 'главы', 'глав'])} опубликовано
                    </p>
                  )}
                </div>
              ) : (
                <div className="px-3 pb-3 sm:px-4">
                  <div className="flex flex-wrap items-center gap-2 border-b border-line py-3">
                    <Button size="sm" icon={<ArrowUpDown className="size-3.5" />} onClick={() => setDescending((v) => !v)}>
                      <span className="hidden sm:inline">Сначала </span>
                      {descending ? 'новые' : 'старые'}
                    </Button>
                    <a
                      href={publicApi.downloadUrl}
                      download
                      className={cx(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 text-[13px] font-medium hover:bg-hover',
                        !list.length && 'pointer-events-none opacity-50',
                      )}
                    >
                      <Download className="size-3.5" /> Скачать
                    </a>
                    <Button size="sm" className="ml-auto" icon={<ArrowDown className="size-3.5" />} onClick={jumpToCurrent} disabled={!list.length}>
                      К главе
                    </Button>
                  </div>

                  {chapters.error ? (
                    <div className="py-6">
                      <ErrorNote>{errorMessage(chapters.error)}</ErrorNote>
                    </div>
                  ) : chapters.loading && !chapters.data ? (
                    <div className="space-y-2 py-3">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="h-8 animate-pulse rounded bg-white/[0.03]" />
                      ))}
                    </div>
                  ) : list.length === 0 ? (
                    <p className="py-10 text-center text-sm text-faint">Главы ещё не опубликованы.</p>
                  ) : (
                    <ChapterList chapters={sorted} highlightId={highlight} />
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <RatingDialog
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        onRated={(rating) => book.setData((prev) => (prev ? { ...prev, rating } : prev!))}
      />
    </>
  );
}
