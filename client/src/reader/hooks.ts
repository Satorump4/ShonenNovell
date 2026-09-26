import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Номер текущей сцены: последняя сцена, чей верх пересёк «линию чтения»
 * (45% высоты экрана). В самом низу страницы — всегда последняя сцена,
 * даже если она короткая.
 */
export function useActiveScene(container: RefObject<HTMLElement | null>, count: number): number {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!count) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const sections = container.current?.querySelectorAll<HTMLElement>('[data-scene]');
      if (!sections?.length) return;
      const line = window.innerHeight * 0.45;
      let index = 0;
      sections.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= line) index = i;
      });
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && window.scrollY > 0) index = sections.length - 1;
      setActive(index);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [container, count]);

  return active;
}

/**
 * Видимость панелей ридера: показываются при движении мыши, прокрутке вверх
 * или тапе; прячутся при чтении (прокрутке вниз) и через пару секунд покоя.
 */
export function useChromeVisibility(locked: boolean) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const lastY = useRef(0);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (window.scrollY > 80) setVisible(false);
    }, 2600);
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      setVisible(true);
      scheduleHide();
    };
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      lastY.current = y;
      if (y < 80) {
        setVisible(true);
        return;
      }
      if (dy > 6) setVisible(false);
      else if (dy < -12) {
        setVisible(true);
        scheduleHide();
      }
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [scheduleHide]);

  useEffect(() => {
    if (locked) window.clearTimeout(timer.current);
    else scheduleHide();
  }, [locked, scheduleHide]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      if (!v) scheduleHide();
      return !v;
    });
  }, [scheduleHide]);

  return { visible: visible || locked, toggle };
}
