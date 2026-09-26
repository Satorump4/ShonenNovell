import { Headphones } from 'lucide-react';
import { settingsStore } from '../lib/settings';
import { audio } from './audio';

/**
 * Первый визит: браузеры не дают сайту включать звук без действия пользователя,
 * поэтому спрашиваем один раз — и этот же клик «разрешает» аудио.
 */
export function SoundIntro() {
  const start = (withMusic: boolean) => {
    settingsStore.set({ introSeen: true, music: withMusic });
    audio.setEnabled(withMusic);
    if (withMusic) audio.unlock();
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="intro-title" className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 text-center shadow-2xl">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15">
          <Headphones className="size-6 text-accent" />
        </div>
        <h2 id="intro-title" className="mt-4 text-[17px] font-semibold">
          Эта книга звучит
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Книга использует атмосферную музыку: она меняется вместе со сценами. Выключить её можно в любой момент.
        </p>
        <div className="mt-6 space-y-2">
          <button
            autoFocus
            onClick={() => start(true)}
            className="h-11 w-full rounded-md bg-accent text-[15px] font-medium text-white hover:bg-accent-hover"
          >
            Начать чтение
          </button>
          <button onClick={() => start(false)} className="h-10 w-full rounded-md text-sm text-muted hover:bg-white/5 hover:text-fg">
            Читать без музыки
          </button>
        </div>
      </div>
    </div>
  );
}
