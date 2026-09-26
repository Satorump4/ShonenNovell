import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { BookOpen, ExternalLink, Image as ImageIcon, LibraryBig, LogOut, Settings } from 'lucide-react';
import type { AdminMeDTO } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { errorMessage, UNAUTHORIZED_EVENT } from '../api/client';
import { Button, cx, ErrorNote, PageSpinner } from '../components/ui';
import { BookSettingsPage } from './BookSettingsPage';
import { ChaptersPage } from './ChaptersPage';
import { Field, TextInput } from './fields';
import { MediaLibraryPage } from './MediaLibraryPage';

function LoginPage({ onLogin }: { onLogin: (me: AdminMeDTO) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onLogin(await adminApi.login(username, password));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-panel p-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-accent">Book admin</p>
          <h1 className="mt-1 text-xl font-semibold">Вход для редактора</h1>
        </div>
        <Field label="Логин">
          <TextInput autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Пароль">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Войти
        </Button>
        <a href="/" className="block text-center text-[13px] text-faint hover:text-fg">
          ← На сайт
        </a>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [me, setMe] = useState<AdminMeDTO | null | undefined>(undefined);

  useEffect(() => {
    document.title = 'Book admin';
    adminApi.me().then(setMe, () => setMe(null));
    const onUnauthorized = () => setMe(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (me === undefined) return <PageSpinner />;
  if (me === null) return <LoginPage onLogin={setMe} />;

  const logout = async () => {
    await adminApi.logout().catch(() => undefined);
    setMe(null);
  };

  const tab = ({ isActive }: { isActive: boolean }) =>
    cx(
      'inline-flex h-[50px] items-center gap-2 border-b-2 px-1 text-sm transition-colors',
      isActive ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-[#1a1a1c]">
        <div className="flex h-[50px] items-center gap-4 px-4">
          <span className="hidden text-[12px] font-semibold uppercase tracking-[0.2em] text-accent sm:inline">Book admin</span>
          <nav className="flex items-center gap-4 overflow-x-auto sm:ml-4 sm:gap-5">
            <NavLink to="/admin/chapters" className={tab}>
              <LibraryBig className="size-4" /> Главы
            </NavLink>
            <NavLink to="/admin/book" className={tab}>
              <Settings className="size-4" /> Книга
            </NavLink>
            <NavLink to="/admin/media" className={tab}>
              <ImageIcon className="size-4" /> Медиатека
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-white/5 hover:text-fg md:inline-flex"
            >
              <BookOpen className="size-3.5" /> Открыть сайт <ExternalLink className="size-3" />
            </a>
            <span className="hidden px-2 text-[13px] text-faint lg:inline">{me.username}</span>
            <Button variant="ghost" size="sm" icon={<LogOut className="size-3.5" />} onClick={logout}>
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <Routes>
        <Route index element={<Navigate to="chapters" replace />} />
        <Route path="chapters/*" element={<ChaptersPage />} />
        <Route path="book" element={<BookSettingsPage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="*" element={<Navigate to="chapters" replace />} />
      </Routes>
    </div>
  );
}
