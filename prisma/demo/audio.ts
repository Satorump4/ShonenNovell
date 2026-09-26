/**
 * Синтез коротких бесшовных демо-лупов в WAV (без внешних файлов и лицензий).
 * Всё пишется в кольцевой буфер: хвосты звуков переходят в начало, и петля
 * звучит без щелчка на стыке. Этого достаточно, чтобы проверить смену музыки;
 * настоящие треки загружаются через медиатеку.
 */

const RATE = 22050;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class Loop {
  readonly data: Float32Array;
  constructor(public seconds: number) {
    this.data = new Float32Array(Math.round(seconds * RATE));
  }
  get length() {
    return this.data.length;
  }
  /** Частота, округлённая так, чтобы целое число периодов уложилось в петлю. */
  fit(freq: number) {
    return Math.round(freq * this.seconds) / this.seconds;
  }
  add(i: number, v: number) {
    const n = this.data.length;
    this.data[((i % n) + n) % n] += v;
  }
}

function toWav(loop: Loop, peak = 0.8): Buffer {
  let max = 0;
  for (const v of loop.data) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? peak / max : 1;
  const samples = loop.data.length;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const s = Math.max(-1, Math.min(1, loop.data[i] * gain));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// Детерминированный шум, чтобы файлы совпадали от запуска к запуску.
function noise(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff - 0.5;
  };
}

/** Спокойный пэд: медленная смена аккордов Am — F — C — G. */
export function calmTrack(): Buffer {
  const loop = new Loop(24);
  const chords = [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [48, 55, 60, 64],
    [55, 59, 62, 67],
  ];
  const seg = loop.length / chords.length;
  chords.forEach((notes, ci) => {
    const start = Math.round(ci * seg);
    const len = Math.round(seg * 1.5); // перекрытие соседних аккордов
    for (const n of notes) {
      const f = loop.fit(midi(n));
      const f2 = loop.fit(midi(n) * 1.003); // лёгкая «расстройка» для объёма
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(Math.sin(Math.PI * t), 2);
        const x = (start + i) / RATE;
        const v = Math.sin(2 * Math.PI * f * x) * 0.6 + Math.sin(2 * Math.PI * f2 * x) * 0.4 + Math.sin(4 * Math.PI * f * x) * 0.08;
        loop.add(start + i, v * env * 0.12);
      }
    }
  });
  // Тихий бас-дрон на ля.
  const bass = loop.fit(midi(45));
  const trem = 1 / 6;
  for (let i = 0; i < loop.length; i++) {
    const x = i / RATE;
    loop.add(i, Math.sin(2 * Math.PI * bass * x) * 0.1 * (0.75 + 0.25 * Math.sin(2 * Math.PI * trem * x)));
  }
  return toWav(loop, 0.6);
}

/** Боевой луп: бочка, малый, хэты и пульсирующий бас (132 BPM, 8 тактов). */
export function battleTrack(): Buffer {
  const bpm = 132;
  const beat = 60 / bpm;
  const loop = new Loop(beat * 32);
  const rnd = noise(7);
  const beatLen = beat * RATE;

  for (let b = 0; b < 32; b++) {
    const at = Math.round(b * beatLen);
    // Бочка на каждую долю.
    for (let i = 0; i < RATE * 0.35; i++) {
      const t = i / RATE;
      const f = 45 + 90 * Math.exp(-t * 28);
      loop.add(at + i, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * 0.9);
    }
    // Малый барабан на 2 и 4.
    if (b % 2 === 1) {
      for (let i = 0; i < RATE * 0.22; i++) {
        const t = i / RATE;
        loop.add(at + i, (rnd() * 0.9 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 18) * 0.55);
      }
    }
    // Хэты восьмыми.
    for (const off of [0, 0.5]) {
      const h = Math.round(at + off * beatLen);
      let prev = 0;
      for (let i = 0; i < RATE * 0.05; i++) {
        const t = i / RATE;
        const n = rnd();
        loop.add(h + i, (n - prev) * Math.exp(-t * 70) * 0.25);
        prev = n;
      }
    }
  }

  // Бас: Dm — Bb — C — A, по 2 такта, восьмыми.
  const roots = [38, 34, 36, 33];
  for (let e = 0; e < 64; e++) {
    const root = roots[Math.floor(e / 16)];
    const f = midi(e % 4 === 3 ? root + 12 : root);
    const at = Math.round((e * beatLen) / 2);
    const len = Math.round((beatLen / 2) * 0.9);
    for (let i = 0; i < len; i++) {
      const t = i / RATE;
      const env = Math.min(1, i / 60) * Math.exp(-t * 5);
      let v = 0;
      for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * f * k * t) / k;
      loop.add(at + i, v * env * 0.22);
    }
  }

  // Тревожная струнная нота поверх.
  const pad = [62, 58, 60, 61];
  const bar2 = loop.length / 4;
  pad.forEach((n, pi) => {
    const f = midi(n + 12);
    const start = Math.round(pi * bar2);
    for (let i = 0; i < bar2; i++) {
      const env = Math.pow(Math.sin((Math.PI * i) / bar2), 1.5);
      const x = i / RATE;
      loop.add(start + i, (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(2 * Math.PI * f * 2.005 * x)) * env * 0.07);
    }
  });
  return toWav(loop, 0.75);
}

/** «После боя»: редкие колокольчики пентатоники над тихим дроном. */
export function aftermathTrack(): Buffer {
  const loop = new Loop(24);
  const drone = [loop.fit(midi(50)), loop.fit(midi(57))];
  for (let i = 0; i < loop.length; i++) {
    const x = i / RATE;
    const swell = 0.7 + 0.3 * Math.sin((2 * Math.PI * x) / 12);
    loop.add(i, (Math.sin(2 * Math.PI * drone[0] * x) + 0.6 * Math.sin(2 * Math.PI * drone[1] * x)) * 0.07 * swell);
  }
  const notes = [74, 77, 81, 79, 72, 76, 74, 69, 72, 74, 79, 77, 74, 72, 69, 67];
  notes.forEach((n, k) => {
    const at = Math.round(k * 1.5 * RATE);
    const f = midi(n);
    for (let i = 0; i < RATE * 4; i++) {
      const t = i / RATE;
      const v =
        Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.2) +
        0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3) +
        0.12 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 6);
      loop.add(at + i, v * Math.min(1, i / 40) * 0.16);
    }
  });
  return toWav(loop, 0.6);
}
