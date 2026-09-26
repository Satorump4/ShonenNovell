import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import type { SearchResultDTO } from '../../../shared/types';
import { errorMessage } from '../api/client';
import { publicApi } from '../api/public';
import { chapterLabel } from '../lib/format';
import { Modal, Spinner } from './ui';

function Highlight({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-accent/25 px-0.5 text-fg">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Поиск по названиям и тексту опубликованных глав. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      publicApi
        .search(q)
        .then((r) => alive && (setResults(r), setError(null)))
        .catch((e) => alive && setError(errorMessage(e)))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const q = query.trim();

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по главам и тексту книги"
          className="h-12 w-full bg-transparent text-base outline-none sm:text-[15px] placeholder:text-faint"
          maxLength={100}
        />
        {loading && <Spinner className="size-4" />}
      </div>
      <div className="min-h-24 p-2">
        {error && <p className="px-3 py-6 text-center text-sm text-danger">{error}</p>}
        {!error && q.length < 2 && <p className="px-3 py-6 text-center text-sm text-faint">Введите хотя бы 2 символа</p>}
        {!error && results && results.length === 0 && <p className="px-3 py-6 text-center text-sm text-faint">Ничего не найдено</p>}
        {results?.map((r) => (
          <Link
            key={r.chapter.id}
            to={`/read/${r.chapter.slug}${r.snippet ? `?find=${encodeURIComponent(q)}` : ''}`}
            onClick={onClose}
            className="block rounded-md px-3 py-2.5 hover:bg-white/5"
          >
            <div className="text-sm">
              <span className="text-fg">{chapterLabel(r.chapter)}</span>
              <span className="text-muted"> — </span>
              <span className="text-muted">
                <Highlight text={r.chapter.title} query={q} />
              </span>
            </div>
            {r.snippet && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-faint">
                <Highlight text={r.snippet} query={q} />
              </p>
            )}
          </Link>
        ))}
      </div>
    </Modal>
  );
}
