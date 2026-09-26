import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BookOpen, Clock, List, LogIn, Menu, Search } from 'lucide-react';
import { chapterLabel } from '../lib/format';
import { getHistory } from '../lib/progress';
import { SearchDialog } from './SearchDialog';
import { cx, IconButton, useDismiss } from './ui';

function HistoryMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const history = open ? getHistory() : [];

  return (
    <div ref={ref} className="relative">
      <IconButton label="История чтения" active={open} onClick={() => setOpen((v) => !v)} className="bg-white/5">
        <Clock className="size-[18px]" />
      </IconButton>
      {open && (
        <div className="fade-in fixed inset-x-4 top-[58px] z-50 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80 rounded-lg border border-line bg-panel shadow-2xl">
          <div className="border-b border-line px-4 py-2.5 text-[13px] font-medium text-muted">История чтения</div>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-faint">Вы ещё ничего не читали</p>
          ) : (
            <ul className="scrollbar-thin max-h-80 overflow-y-auto py-1">
              {history.map((h) => (
                <li key={h.slug}>
                  <Link to={`/read/${h.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{chapterLabel(h)}</div>
                      <div className="truncate text-[13px] text-faint">{h.title}</div>
                    </div>
                    <span className="text-[12px] tabular-nums text-date">{Math.round(h.percent * 100)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Верхняя панель страницы книги: компактная, без баннера. */
export function Navbar({ title }: { title?: string }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));
  const navigate = useNavigate();

  const goChapters = () => {
    setMenuOpen(false);
    navigate('/?tab=chapters');
    requestAnimationFrame(() => document.getElementById('chapters')?.scrollIntoView({ block: 'start' }));
  };

  const navItem = 'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-fg/90 hover:bg-white/5';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[#1a1a1c] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-[50px] max-w-[1200px] items-center gap-2 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 pr-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent">
            <BookOpen className="size-4 text-white" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight sm:max-w-[240px]">{title ?? ''}</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <button onClick={goChapters} className={navItem}>
            <List className="size-4 text-muted" /> Главы
          </button>
          <button onClick={() => setSearchOpen(true)} className={navItem}>
            <Search className="size-4 text-muted" /> Поиск
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <IconButton label="Поиск" onClick={() => setSearchOpen(true)} className="md:hidden">
            <Search className="size-[18px]" />
          </IconButton>
          <HistoryMenu />
          <Link
            to="/admin"
            className="hidden h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover sm:inline-flex"
          >
            <LogIn className="size-4" /> Войти
          </Link>
          <div ref={menuRef} className="relative sm:hidden">
            <IconButton label="Меню" active={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <Menu className="size-5" />
            </IconButton>
            {menuOpen && (
              <div className="fade-in absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl">
                <button onClick={goChapters} className={cx(navItem, 'w-full rounded-none px-4')}>
                  <List className="size-4 text-muted" /> Главы
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setSearchOpen(true);
                  }}
                  className={cx(navItem, 'w-full rounded-none px-4')}
                >
                  <Search className="size-4 text-muted" /> Поиск
                </button>
                <Link to="/admin" className={cx(navItem, 'w-full rounded-none px-4 text-accent')}>
                  <LogIn className="size-4" /> Войти
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
