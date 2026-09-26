import { useState } from 'react';
import { ChevronDown, ChevronUp, Music, Palette, Timer, Trash2, VolumeX } from 'lucide-react';
import type { MusicMode, SceneDTO } from '../../../shared/types';
import { cx, IconButton } from '../components/ui';
import { Field, Segmented, inputClass } from './fields';
import { MediaSelect } from './MediaPicker';
import { RichEditor } from './RichEditor';

export type SceneDraft = SceneDTO & { dirty: boolean };

const PRESETS = [
  '#101218',
  'linear-gradient(180deg, #0b1322 0%, #0f1a30 100%)',
  'linear-gradient(180deg, #1c0b0b 0%, #0e0505 100%)',
  'linear-gradient(180deg, #0c1a14 0%, #08110d 100%)',
  'linear-gradient(180deg, #1a1224 0%, #0f0a16 100%)',
  'linear-gradient(180deg, #1f1a12 0%, #12100b 100%)',
  '#050505',
];

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Мини-превью фона сцены. */
function BackgroundSwatch({ scene, inherited }: { scene: SceneDraft; inherited: string }) {
  const color = scene.background ?? inherited;
  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md border border-line" style={{ background: color }}>
      {scene.backgroundImage && (
        <>
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${scene.backgroundImage.url}")` }} />
          <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${scene.backgroundDim})` }} />
        </>
      )}
      <span className="absolute bottom-1.5 left-2 font-serif text-[13px] text-[#e6e4e0]">Текст книги на этом фоне</span>
      {!scene.background && !scene.backgroundImage && (
        <span className="absolute right-2 top-1.5 rounded bg-black/50 px-1.5 text-[11px] text-white/70">как у предыдущей сцены</span>
      )}
    </div>
  );
}

function Summary({ scene }: { scene: SceneDraft }) {
  const chip = 'inline-flex max-w-full items-center gap-1.5 truncate rounded bg-white/5 px-2 py-0.5 text-[12px] text-muted';
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={chip}>
        {scene.musicMode === 'SILENCE' ? <VolumeX className="size-3" /> : <Music className="size-3" />}
        {scene.musicMode === 'INHERIT'
          ? 'музыка продолжается'
          : scene.musicMode === 'SILENCE'
            ? 'тишина'
            : scene.music
              ? `${scene.music.filename} · ${Math.round(scene.volume * 100)}%`
              : 'трек не выбран'}
      </span>
      <span className={chip}>
        <Palette className="size-3" />
        {scene.backgroundImage ? 'изображение' : scene.background ? 'свой фон' : 'фон наследуется'}
      </span>
      <span className={chip}>
        <Timer className="size-3" />
        {(scene.transitionMs / 1000).toFixed(1)} с
      </span>
    </div>
  );
}

export function SceneCard({
  scene,
  index,
  total,
  inheritedBackground,
  onChange,
  onMove,
  onDelete,
}: {
  scene: SceneDraft;
  index: number;
  total: number;
  inheritedBackground: string;
  onChange: (patch: Partial<SceneDTO>) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bgMode = scene.background ? 'custom' : 'inherit';

  return (
    <section className="rounded-lg border border-line bg-panel">
      {/* Заголовок сцены */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
        <span className="shrink-0 rounded bg-accent/15 px-2 py-0.5 text-[12px] font-medium text-accent">Сцена {index + 1}</span>
        <input
          value={scene.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Название сцены (видно только вам)"
          maxLength={200}
          className="h-8 min-w-0 flex-1 rounded bg-transparent px-2 text-base outline-none sm:text-sm placeholder:text-faint hover:bg-white/5 focus:bg-white/5"
        />
        {scene.dirty && <span className="size-2 shrink-0 rounded-full bg-amber-400" title="Есть несохранённые изменения" />}
        <IconButton label="Сцена выше" className="size-8" disabled={index === 0} onClick={() => onMove(-1)}>
          <ChevronUp className="size-4" />
        </IconButton>
        <IconButton label="Сцена ниже" className="size-8" disabled={index === total - 1} onClick={() => onMove(1)}>
          <ChevronDown className="size-4" />
        </IconButton>
        <IconButton label="Удалить сцену" className="size-8 hover:!text-danger" disabled={total <= 1} onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      {/* Атмосфера */}
      <div className="border-b border-line px-3 py-3 sm:px-4">
        <button type="button" onClick={() => setSettingsOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
          <span className="text-[13px] font-medium text-fg">Атмосфера</span>
          <div className="min-w-0 flex-1">{!settingsOpen && <Summary scene={scene} />}</div>
          <ChevronDown className={cx('size-4 shrink-0 text-faint transition-transform', settingsOpen && 'rotate-180')} />
        </button>

        {settingsOpen && (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {/* Музыка */}
            <div className="space-y-3">
              <Field label="Музыка">
                <Segmented<MusicMode>
                  value={scene.musicMode}
                  onChange={(musicMode) => onChange({ musicMode })}
                  options={[
                    ['INHERIT', 'Продолжить'],
                    ['TRACK', 'Трек'],
                    ['SILENCE', 'Тишина'],
                  ]}
                />
              </Field>
              {scene.musicMode === 'TRACK' && (
                <>
                  <MediaSelect type="AUDIO" value={scene.music} onChange={(music) => onChange({ music })} placeholder="Выбрать трек из медиатеки" />
                  <Field label="Громкость" hint={`${Math.round(scene.volume * 100)}%`}>
                    <input
                      type="range"
                      className="w-full"
                      min={0}
                      max={1}
                      step={0.05}
                      value={scene.volume}
                      onChange={(e) => onChange({ volume: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
              {scene.musicMode === 'INHERIT' && <p className="text-[12px] text-faint">Играет то же, что в предыдущей сцене, без перезапуска.</p>}
              {scene.musicMode === 'SILENCE' && <p className="text-[12px] text-faint">Музыка плавно затихнет.</p>}

              <Field label="Длительность перехода" hint={`${(scene.transitionMs / 1000).toFixed(1)} с`}>
                <input
                  type="range"
                  className="w-full"
                  min={300}
                  max={5000}
                  step={100}
                  value={scene.transitionMs}
                  onChange={(e) => onChange({ transitionMs: Number(e.target.value) })}
                />
              </Field>
            </div>

            {/* Фон */}
            <div className="space-y-3">
              <Field label="Фон">
                <Segmented
                  value={bgMode}
                  onChange={(mode) => onChange({ background: mode === 'inherit' ? null : (scene.background ?? '#101218') })}
                  options={[
                    ['inherit', 'Как у предыдущей'],
                    ['custom', 'Свой цвет'],
                  ]}
                />
              </Field>
              {bgMode === 'custom' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label="Цвет фона"
                      value={isHex(scene.background ?? '') ? scene.background! : '#101218'}
                      onChange={(e) => onChange({ background: e.target.value })}
                      className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-line bg-page p-1"
                    />
                    <input
                      className={inputClass}
                      value={scene.background ?? ''}
                      onChange={(e) => onChange({ background: e.target.value })}
                      placeholder="#160d0d или linear-gradient(...)"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        title={p}
                        aria-label={`Фон ${p}`}
                        onClick={() => onChange({ background: p })}
                        className={cx('size-7 rounded border', scene.background === p ? 'border-accent' : 'border-line hover:border-white/30')}
                        style={{ background: p }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <Field label="Фоновое изображение">
                <MediaSelect
                  type="IMAGE"
                  value={scene.backgroundImage}
                  onChange={(backgroundImage) => onChange({ backgroundImage })}
                  placeholder="Без изображения"
                />
              </Field>
              {scene.backgroundImage && (
                <Field label="Затемнение изображения" hint={`${Math.round(scene.backgroundDim * 100)}%`}>
                  <input
                    type="range"
                    className="w-full"
                    min={0}
                    max={0.9}
                    step={0.05}
                    value={scene.backgroundDim}
                    onChange={(e) => onChange({ backgroundDim: Number(e.target.value) })}
                  />
                </Field>
              )}
              <BackgroundSwatch scene={scene} inherited={inheritedBackground} />
            </div>
          </div>
        )}
      </div>

      {/* Текст */}
      <div className="p-2 sm:p-3">
        <RichEditor value={scene.content} onChange={(content) => onChange({ content })} />
      </div>
    </section>
  );
}

