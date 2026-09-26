/**
 * AudioDirector — единственная точка управления музыкой на сайте.
 *
 * Гарантии:
 *  • одновременно «звучит» максимум один трек; при смене сцены старый плавно
 *    затухает, новый плавно появляется (кроссфейд), и затухший сразу останавливается;
 *  • если следующая сцена использует тот же трек — он не перезапускается,
 *    меняется только громкость;
 *  • быстрые переключения (прокрутка туда-обратно) не плодят плееры: используется
 *    пул из трёх <audio>, а трек, который ещё затухает, «подхватывается» обратно;
 *  • музыка не обязательна: если браузер запретил звук, чтение продолжается без неё.
 *
 * Громкость управляется через Web Audio (GainNode): на iOS свойство
 * HTMLMediaElement.volume только для чтения, поэтому иначе плавные fade там невозможны.
 */

export interface AudioTarget {
  url: string;
  /** 0..1 — громкость трека сцены (умножается на общую громкость). */
  volume: number;
}

interface Slot {
  el: HTMLAudioElement;
  gain: GainNode | null;
  url: string | null;
  stopTimer: number | undefined;
}

export interface AudioSnapshot {
  /** Звук разблокирован жестом пользователя. */
  ready: boolean;
  /** Есть трек, который должен играть, но браузер пока не разрешил звук. */
  waiting: boolean;
}

/** 0.05 с тишины — чтобы «разблокировать» элементы <audio> жестом пользователя (iOS/Safari). */
function silenceUrl(): string {
  const samples = 400; // 8 кГц, 8 бит
  const buf = new DataView(new ArrayBuffer(44 + samples));
  const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  buf.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, 8000, true);
  buf.setUint32(28, 8000, true);
  buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true);
  str(36, 'data');
  buf.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf.buffer], { type: 'audio/wav' }));
}

type AudioContextCtor = typeof AudioContext;

class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private slots: Slot[] = [];
  private current: Slot | null = null;
  private fading: Slot[] = [];
  private desired: AudioTarget | null = null;
  private enabled = true;
  private masterVolume = 0.8;
  private blessed = false;
  private listeners = new Set<() => void>();
  private snapshot: AudioSnapshot = { ready: false, waiting: false };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.onVisibility());
    }
  }

  // ---------- подписка для React (useSyncExternalStore) ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    const ready = this.ctx?.state === 'running' && this.blessed;
    const waiting = this.enabled && !!this.desired && !ready;
    if (ready !== this.snapshot.ready || waiting !== this.snapshot.waiting) {
      this.snapshot = { ready, waiting };
      this.listeners.forEach((l) => l());
    }
  }

  // ---------- публичное API ----------

  /**
   * Вызывать ТОЛЬКО из обработчика жеста пользователя (click/keydown/touchend):
   * создаёт AudioContext и «разрешает» элементы <audio>.
   */
  unlock() {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;
    // Уже всё разрешено и играет — повторные жесты ничего не трогают.
    if (this.ctx?.state === 'running' && this.blessed && (!this.current || !this.current.el.paused)) return;

    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.masterVolume : 0;
      this.master.connect(this.ctx.destination);
      this.ctx.addEventListener('statechange', () => this.emit());
      for (let i = 0; i < 3; i++) this.slots.push(this.createSlot());
    }

    if (!this.blessed) {
      this.blessed = true;
      const silence = silenceUrl();
      for (const slot of this.slots) {
        if (slot.url) continue;
        slot.el.src = silence;
        slot.el.play().then(
          () => {
            if (!slot.url) slot.el.pause();
          },
          () => undefined,
        );
      }
    }

    // play() должен вызываться синхронно внутри жеста — поэтому apply() идёт сразу,
    // не дожидаясь resume(); запланированные fade начнутся, когда контекст оживёт.
    if (this.ctx.state === 'suspended' && document.visibilityState === 'visible') {
      this.ctx.resume().then(
        () => this.emit(),
        () => this.emit(),
      );
    }
    this.apply(700);
    this.emit();
  }

  /**
   * Сменить музыку.
   * target: трек — играть его; null — плавная тишина; undefined — оставить как есть.
   */
  play(target: AudioTarget | null | undefined, fadeMs: number) {
    if (target === undefined) return;
    this.desired = target;
    this.apply(fadeMs);
    this.emit();
  }

  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (this.master && this.ctx) this.rampParam(this.master.gain, on ? this.masterVolume : 0, 400);
    this.apply(on ? 900 : 400);
    this.emit();
  }

  setVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.master && this.enabled) this.rampParam(this.master.gain, this.masterVolume, 120);
  }

  // ---------- внутренняя механика ----------

  private createSlot(): Slot {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    const slot: Slot = { el, gain: null, url: null, stopTimer: undefined };
    if (this.ctx && this.master) {
      try {
        const source = this.ctx.createMediaElementSource(el);
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(this.master);
        slot.gain = gain;
      } catch {
        slot.gain = null; // запасной путь — громкость через el.volume
      }
    }
    return slot;
  }

  private get running() {
    return !!this.ctx && this.ctx.state !== 'closed' && this.blessed;
  }

  private apply(fadeMs: number) {
    if (!this.running) return;
    const target = this.enabled ? this.desired : null;

    // Тот же трек — не перезапускаем, только подстраиваем громкость.
    if (target && this.current?.url === target.url) {
      this.setSlotVolume(this.current, target.volume, fadeMs);
      if (this.current.el.paused) this.startSlot(this.current, target, fadeMs);
      return;
    }

    const previous = this.current;
    this.current = null;
    if (previous) this.fadeOut(previous, fadeMs);
    if (!target) return;

    // Трек ещё затухает (пользователь прокрутил назад) — возвращаем его.
    const revived = this.fading.find((s) => s.url === target.url);
    if (revived) {
      window.clearTimeout(revived.stopTimer);
      this.fading = this.fading.filter((s) => s !== revived);
      this.current = revived;
      this.setSlotVolume(revived, target.volume, fadeMs);
      if (revived.el.paused) this.startSlot(revived, target, fadeMs);
      return;
    }

    const slot = this.acquireSlot();
    slot.url = target.url;
    slot.el.crossOrigin = isCrossOrigin(target.url) ? 'anonymous' : null;
    slot.el.src = target.url;
    this.setSlotVolume(slot, 0, 0);
    this.current = slot;
    this.startSlot(slot, target, fadeMs);
  }

  private startSlot(slot: Slot, target: AudioTarget, fadeMs: number) {
    slot.el.play().then(
      () => {
        if (this.current === slot) this.setSlotVolume(slot, target.volume, fadeMs);
      },
      (err: DOMException) => {
        if (err?.name === 'NotAllowedError') {
          // Браузер не разрешил звук — ждём следующего жеста пользователя.
          this.blessed = false;
          this.emit();
        } else if (err?.name !== 'AbortError') {
          console.warn('[audio] cannot play', target.url, err);
        }
      },
    );
  }

  private fadeOut(slot: Slot, fadeMs: number) {
    this.setSlotVolume(slot, 0, fadeMs);
    this.fading.push(slot);
    window.clearTimeout(slot.stopTimer);
    slot.stopTimer = window.setTimeout(() => this.stopSlot(slot), fadeMs + 120);
    // Больше одного затухающего трека не держим: самый старый глушим сразу.
    while (this.fading.length > 1) this.stopSlot(this.fading[0]);
  }

  private stopSlot(slot: Slot) {
    window.clearTimeout(slot.stopTimer);
    slot.stopTimer = undefined;
    this.fading = this.fading.filter((s) => s !== slot);
    if (this.current === slot) return;
    this.setSlotVolume(slot, 0, 0);
    slot.el.pause();
    slot.el.removeAttribute('src');
    slot.el.load();
    slot.url = null;
  }

  private acquireSlot(): Slot {
    const free = this.slots.find((s) => s !== this.current && !this.fading.includes(s));
    if (free) return free;
    const oldest = this.fading[0];
    this.stopSlot(oldest);
    return oldest;
  }

  private setSlotVolume(slot: Slot, volume: number, ms: number) {
    if (slot.gain) {
      this.rampParam(slot.gain.gain, volume, ms);
    } else {
      // Без Web Audio — мгновенно (редкие старые браузеры).
      slot.el.volume = Math.max(0, Math.min(1, volume * (this.enabled ? this.masterVolume : 0)));
    }
  }

  private rampParam(param: AudioParam, value: number, ms: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (ms <= 0) param.setValueAtTime(value, now);
    else param.linearRampToValueAtTime(value, now + ms / 1000);
  }

  private onVisibility() {
    if (!this.ctx) return;
    if (document.visibilityState === 'hidden') {
      // Вкладка скрыта — не играем в фоне.
      this.current?.el.pause();
      this.fading.forEach((s) => this.stopSlot(s));
      void this.ctx.suspend().catch(() => undefined);
    } else if (this.blessed) {
      this.ctx.resume().then(
        () => {
          if (this.current && this.enabled && this.desired) this.startSlot(this.current, this.desired, 600);
          this.emit();
        },
        () => this.emit(),
      );
    }
  }
}

function isCrossOrigin(url: string) {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export const audio = new AudioDirector();
