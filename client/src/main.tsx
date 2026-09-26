import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import '@fontsource-variable/inter';
import '@fontsource-variable/literata';
import './styles.css';
import { PageSpinner } from './components/ui';
import { settingsStore } from './lib/settings';
import BookPage from './pages/BookPage';
import { audio } from './reader/audio';

// Ридер и админка грузятся отдельными чанками: главная открывается быстрее.
const ReaderRoute = lazy(() => import('./pages/ReaderRoute'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

// Позицию чтения ридер восстанавливает сам.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Браузеры разрешают звук только после действия пользователя: первый же
// клик/тап/клавиша «разблокирует» аудио (если читатель не выключил музыку).
const unlockAudio = () => {
  const s = settingsStore.get();
  if (s.music && s.introSeen) audio.unlock();
};
for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const) {
  window.addEventListener(type, unlockAudio, { capture: true, passive: true });
}

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold text-faint">404</p>
      <p className="text-muted">Такой страницы нет</p>
      <Link to="/" className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover">
        На главную
      </Link>
    </div>
  );
}

const withSuspense = (node: ReactNode) => <Suspense fallback={<PageSpinner />}>{node}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: <BookPage /> },
  { path: '/read/:slug', element: withSuspense(<ReaderRoute />) },
  { path: '/preview/:id', element: withSuspense(<ReaderRoute preview />) },
  { path: '/admin/*', element: withSuspense(<AdminApp />) },
  { path: '*', element: <NotFound /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
