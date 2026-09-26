import { useEffect, useRef, useState } from 'react';
import { backgroundKey, type BackgroundSpec } from './atmosphere';

interface Layer {
  id: number;
  spec: BackgroundSpec;
  duration: number;
}

/**
 * Фон ридера: слои, наложенные друг на друга. Новый фон появляется поверх
 * старого через opacity (crossfade), после чего старые слои удаляются.
 * Изображение сначала загружается, и только потом начинается переход —
 * чтобы не было «вспышки» пустого фона.
 */
export function AtmosphereStage({ spec, duration }: { spec: BackgroundSpec; duration: number }) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const nextId = useRef(1);
  const key = backgroundKey(spec);

  useEffect(() => {
    let cancelled = false;
    const push = () => {
      if (cancelled) return;
      setLayers((prev) => {
        if (prev.length && backgroundKey(prev[prev.length - 1].spec) === key) return prev;
        return [...prev.slice(-2), { id: nextId.current++, spec, duration }];
      });
    };
    if (spec.image) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = push;
      img.onerror = push;
      img.src = spec.image;
    } else {
      push();
    }
    return () => {
      cancelled = true;
    };
    // spec целиком описывается ключом
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onShown = (id: number) => setLayers((prev) => (prev[prev.length - 1]?.id === id ? prev.slice(-1) : prev));

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-page">
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="bg-layer"
          style={{ background: layer.spec.color, ['--dur' as string]: `${layer.duration}ms` }}
          onAnimationEnd={() => onShown(layer.id)}
        >
          {layer.spec.image && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${layer.spec.image.replace(/"/g, '%22')}")` }}
            />
          )}
          {layer.spec.image && layer.spec.dim > 0 && (
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${layer.spec.dim})` }} />
          )}
        </div>
      ))}
    </div>
  );
}
