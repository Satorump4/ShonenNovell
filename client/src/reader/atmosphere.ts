import type { SceneDTO } from '../../../shared/types';
import type { AudioTarget } from './audio';

export interface BackgroundSpec {
  color: string;
  image: string | null;
  dim: number;
}

export interface SceneAtmosphere {
  background: BackgroundSpec;
  /** Трек; null — тишина; undefined — оставить то, что играет. */
  music: AudioTarget | null | undefined;
  transitionMs: number;
}

/**
 * Превращает настройки сцен в «итоговую атмосферу» каждой сцены:
 * пустой фон или режим музыки «продолжить» наследуют значение предыдущей сцены.
 */
export function resolveAtmosphere(scenes: SceneDTO[], defaultBackground: string): SceneAtmosphere[] {
  let background: BackgroundSpec = { color: defaultBackground, image: null, dim: 0 };
  let music: AudioTarget | null | undefined = undefined;

  return scenes.map((scene) => {
    if (scene.backgroundImage) {
      background = { color: scene.background ?? background.color, image: scene.backgroundImage.url, dim: scene.backgroundDim };
    } else if (scene.background) {
      background = { color: scene.background, image: null, dim: 0 };
    }

    if (scene.musicMode === 'TRACK' && scene.music) music = { url: scene.music.url, volume: scene.volume };
    else if (scene.musicMode === 'SILENCE') music = null;

    return { background, music, transitionMs: scene.transitionMs };
  });
}

export const backgroundKey = (b: BackgroundSpec) => `${b.color}|${b.image ?? ''}|${b.dim}`;

export const chapterHasMusic = (scenes: SceneDTO[]) => scenes.some((s) => s.musicMode === 'TRACK' && s.music);
