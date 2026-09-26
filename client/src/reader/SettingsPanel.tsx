import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Toggle, cx } from '../components/ui';
import { settingsStore, usePrefersReducedMotion, useSettings } from '../lib/settings';
import { audio } from './audio';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        {hint && <span className="text-[12px] tabular-nums text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Range(props: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="range"
      aria-label={props.label}
      className="w-full disabled:opacity-40"
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

export function SettingsPanel() {
  const s = useSettings();
  const reduced = usePrefersReducedMotion();
  const set = settingsStore.set;

  const toggleMusic = (on: boolean) => {
    set({ music: on });
    audio.setEnabled(on);
    if (on) audio.unlock(); // клик — это жест пользователя, звук можно разрешить
  };

  return (
    <div className="space-y-5 p-4">
      <Row label="Размер текста" hint={`${s.fontSize}px`}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted">A</span>
          <Range label="Размер текста" value={s.fontSize} min={15} max={28} step={1} onChange={(v) => set({ fontSize: v })} />
          <span className="text-[19px] text-muted">A</span>
        </div>
      </Row>
      <Row label="Ширина текста" hint={`${s.width}px`}>
        <Range label="Ширина текста" value={s.width} min={520} max={960} step={20} onChange={(v) => set({ width: v })} />
      </Row>
      <Row label="Межстрочный интервал" hint={s.lineHeight.toFixed(2)}>
        <Range label="Межстрочный интервал" value={s.lineHeight} min={1.5} max={2.2} step={0.05} onChange={(v) => set({ lineHeight: v })} />
      </Row>
      <Row label="Шрифт">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-white/5 p-1">
          {(
            [
              ['serif', 'С засечками'],
              ['sans', 'Без засечек'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => set({ font: key })}
              className={cx(
                'h-8 rounded text-[13px] transition-colors',
                s.font === key ? 'bg-raised text-fg shadow' : 'text-muted hover:text-fg',
                key === 'serif' ? 'font-serif' : 'font-sans',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Яркость" hint={`${Math.round(s.brightness * 100)}%`}>
        <Range label="Яркость" value={s.brightness} min={0.4} max={1} step={0.05} onChange={(v) => set({ brightness: v })} />
      </Row>

      <div className="space-y-3 border-t border-line pt-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Музыка</span>
          <Toggle label="Музыка" checked={s.music} onChange={toggleMusic} />
        </label>
        <Row label="Громкость" hint={`${Math.round(s.volume * 100)}%`}>
          <Range
            label="Громкость"
            value={s.volume}
            min={0}
            max={1}
            step={0.05}
            disabled={!s.music}
            onChange={(v) => {
              set({ volume: v });
              audio.setVolume(v);
            }}
          />
        </Row>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Плавные переходы
            {reduced && <span className="block text-[12px] text-faint">Система просит уменьшить движение — переходы сокращены</span>}
          </span>
          <Toggle label="Плавные переходы" checked={s.animations} onChange={(v) => set({ animations: v })} />
        </label>
      </div>

      <button
        onClick={() => set({ fontSize: 19, width: 700, lineHeight: 1.8, font: 'serif', brightness: 1 })}
        className="inline-flex items-center gap-1.5 text-[13px] text-faint hover:text-fg"
      >
        <RotateCcw className="size-3.5" /> Сбросить оформление
      </button>
    </div>
  );
}
