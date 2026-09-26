import { useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router';
import { ChevronDown, ChevronUp, FileText, Plus } from 'lucide-react';
import type { AdminChapterSummaryDTO } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { errorMessage } from '../api/client';
import { Button, cx, ErrorNote, Spinner } from '../components/ui';
import { chapterLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { ChapterEditor } from './ChapterEditor';

export function ChaptersPage() {
  const list = useAsync(() => adminApi.chapters(), []);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chapters = list.data ?? [];

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const chapter = await adminApi.createChapter('Новая глава');
      list.reload();
      navigate(`/admin/chapters/${chapter.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= chapters.length) return;
    const next = [...chapters];
    [next[index], next[target]] = [next[target], next[index]];
    list.setData(next);
    try {
      await adminApi.reorderChapters(next.map((c) => c.id));
    } catch (err) {
      setError(errorMessage(err));
      list.reload();
    }
  };

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-line md:sticky md:top-[50px] md:h-[calc(100dvh-50px)] md:w-72 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-faint">Главы</h2>
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} loading={creating} onClick={create}>
            Новая
          </Button>
        </div>
        {error && (
          <div className="px-3 pb-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {list.loading && !list.data ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : chapters.length === 0 ? (
          <p className="px-4 py-6 text-sm text-faint">Глав пока нет. Создайте первую.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto px-2 pb-4 md:max-h-none">
            {chapters.map((c, i) => (
              <ChapterRow key={c.id} chapter={c} first={i === 0} last={i === chapters.length - 1} onMove={(d) => move(i, d)} />
            ))}
          </ul>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        <Routes>
          <Route
            index
            element={
              <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center text-faint">
                <FileText className="size-8" />
                <p className="text-sm">Выберите главу слева или создайте новую</p>
              </div>
            }
          />
          <Route path=":id" element={<ChapterEditor onChanged={list.reload} />} />
        </Routes>
      </section>
    </div>
  );
}

function ChapterRow({
  chapter,
  first,
  last,
  onMove,
}: {
  chapter: AdminChapterSummaryDTO;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <li className="group relative">
      <NavLink
        to={`/admin/chapters/${chapter.id}`}
        className={({ isActive }) =>
          cx('flex items-center gap-2.5 rounded-md py-2 pl-3 pr-14 text-sm transition-colors', isActive ? 'bg-accent/12 text-fg' : 'text-muted hover:bg-white/5 hover:text-fg')
        }
      >
        <span
          className={cx('size-2 shrink-0 rounded-full', chapter.published ? 'bg-success' : 'bg-white/20')}
          title={chapter.published ? 'Опубликована' : 'Черновик'}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-faint">{chapterLabel(chapter)}</span>
          <span className="block truncate">{chapter.title}</span>
        </span>
      </NavLink>
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 flex-col opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <button aria-label="Выше" disabled={first} onClick={() => onMove(-1)} className="rounded p-0.5 text-faint hover:bg-white/10 hover:text-fg disabled:opacity-25">
          <ChevronUp className="size-3.5" />
        </button>
        <button aria-label="Ниже" disabled={last} onClick={() => onMove(1)} className="rounded p-0.5 text-faint hover:bg-white/10 hover:text-fg disabled:opacity-25">
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
