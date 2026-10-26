/**
 * Sound library of the synthesized soundtrack — a dependency-free TypeScript port of 4PM's `93-video/audio/synth.py`
 * (instruments, SFX, a reverb, mixing and a 16-bit stereo WAV writer). Erasable TypeScript only, so Node runs it with
 * type stripping. Filters are biquads and the reverb is algorithmic (comb + all-pass) instead of FFT convolution.
 */
import { writeFileSync } from "node:fs";

export const SR = 44100;

/** Deterministic random numbers (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRng(4);

/** Gaussian noise of n samples. */
function noise(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    out[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  return out;
}

/** MIDI note → Hz. */
export function note(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

/** Attack / exponential-decay envelope value at time t. */
function env(t: number, a: number, d: number): number {
  return Math.min(t / a, 1) * Math.exp(-t / d);
}

/** Biquad filter in place (RBJ cookbook): low-pass, high-pass or band-pass. */
function biquad(x: Float32Array, type: "lp" | "hp" | "bp", f0: number, q = 0.707): Float32Array {
  const w = (2 * Math.PI * Math.min(f0, SR * 0.45)) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  let b0: number, b1: number, b2: number;
  if (type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
  return x;
}

/** Band-pass whose centre sweeps exponentially f0 → f1 (whooshes / risers). */
function sweep(x: Float32Array, f0: number, f1: number, q: number): Float32Array {
  const out = new Float32Array(x.length);
  let lp = 0, bp = 0;
  const damp = 1 / q;
  for (let i = 0; i < x.length; i++) {
    const fc = f0 * (f1 / f0) ** (i / x.length);
    const k = 2 * Math.sin((Math.PI * fc) / SR);
    const hp = x[i]! - lp - damp * bp;
    bp += k * hp;
    lp += k * bp;
    out[i] = bp;
  }
  return out;
}

/** Peak-normalise a buffer to `peak`. */
function norm(x: Float32Array, peak = 1): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i]! / m) * peak;
  return x;
}

// ---------- instruments (mono) ----------

/** Kick drum: pitch-swept sine with a short click. */
export function kick(gain = 1): Float32Array {
  const n = Math.floor(0.45 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  const click = noise(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (45 + 110 * Math.exp(-t * 28))) / SR;
    out[i] = gain * (Math.sin(ph) * env(t, 0.001, 0.16) + click[i]! * Math.exp(-t * 300) * 0.3);
  }
  return out;
}

/** Clap / snare: band-passed noise burst. */
export function clap(gain = 0.5): Float32Array {
  const n = Math.floor(0.3 * SR);
  const nz = norm(biquad(biquad(noise(n), "hp", 900), "lp", 6000));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    nz[i] = gain * nz[i]! * Math.exp(-t * 18) * (1 + (t < 0.03 && Math.sin(2 * Math.PI * 90 * t) > 0 ? 0.6 : 0));
  }
  return nz;
}

/** Hi-hat: high-passed noise tick. */
export function hat(gain = 0.18, d = 0.04): Float32Array {
  const n = Math.floor(0.12 * SR);
  const nz = norm(biquad(biquad(noise(n), "hp", 7000), "hp", 7000));
  for (let i = 0; i < n; i++) nz[i] = gain * nz[i]! * env(i / SR, 0.001, d);
  return nz;
}

/** Band-limited saw by additive synthesis. */
function sawAt(freq: number, t: number, harmonics: number): number {
  let v = 0;
  for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * freq * h * t) / h;
  return v * 0.6;
}

/** Bass note (MIDI m) with a sub-octave, for `length` seconds. */
export function bass(m: number, length: number, gain = 0.32): Float32Array {
  const n = Math.floor(length * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t >= length * 0.95) break;
    out[i] = gain * (sawAt(note(m), t, 8) + 0.5 * Math.sin(2 * Math.PI * note(m - 12) * t)) * env(t, 0.005, length * 0.8);
  }
  return out;
}

/** Short plucked note (MIDI m). */
export function pluck(m: number, gain = 0.12): Float32Array {
  const n = Math.floor(0.5 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = gain * (Math.sin(2 * Math.PI * note(m) * t) + 0.35 * Math.sin(2 * Math.PI * note(m) * 2 * t) * Math.exp(-t * 12)) * env(t, 0.002, 0.13);
  }
  return out;
}

/** Detuned stereo saw pad playing a chord, soft attack and release; returns [left, right]. */
export function pad(chord: number[], length: number, gain = 0.07): [Float32Array, Float32Array] {
  const n = Math.floor(length * SR);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (const m of chord) {
    const fl = note(m) * 2 ** (-0.12 / 12);
    const fr = note(m) * 2 ** (0.12 / 12);
    const fc = note(m);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const c = sawAt(fc, t, 6);
      l[i] += sawAt(fl, t, 6) + c;
      r[i] += sawAt(fr, t, 6) + c;
    }
  }
  biquad(l, "lp", 1800);
  biquad(r, "lp", 1800);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = Math.min(t / 0.6, 1) * Math.max(0, Math.min((length - t) / 0.5, 1));
    l[i] = (gain * l[i]! * a) / chord.length;
    r[i] = (gain * r[i]! * a) / chord.length;
  }
  return [l, r];
}

/** One sound effect: impact, swish, riser, pop, shimmer. */
export function sfx(kind: "impact" | "swish" | "riser" | "pop" | "shimmer"): Float32Array {
  if (kind === "impact") {
    const n = Math.floor(1.8 * SR);
    const nz = biquad(noise(n), "lp", 2500);
    const out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (30 + 70 * Math.exp(-t * 8))) / SR;
      out[i] = 0.9 * (Math.sin(ph) * Math.exp(-t * 2.2) + nz[i]! * Math.exp(-t * 6) * 0.25);
    }
    return out;
  }
  if (kind === "swish" || kind === "riser") {
    const len = kind === "swish" ? 0.55 : 2.0;
    const n = Math.floor(len * SR);
    const x = kind === "swish" ? sweep(noise(n), 600, 6000, 3) : sweep(noise(n), 300, 9000, 5);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      x[i] = kind === "swish" ? 0.22 * x[i]! * Math.sin(Math.PI * p) ** 2 : 0.18 * x[i]! * p * p;
    }
    return x;
  }
  if (kind === "pop") {
    const n = Math.floor(0.18 * SR);
    const out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (520 + 900 * (1 - Math.exp(-t * 60)))) / SR;
      out[i] = 0.18 * Math.sin(ph) * env(t, 0.001, 0.05);
    }
    return out;
  }
  const n = Math.floor(1.6 * SR);
  const out = new Float32Array(n);
  [81, 84, 88, 93, 96].forEach((m, k) => {
    const p = pluck(m, 0.1);
    const s = Math.floor(k * 0.06 * SR);
    for (let i = 0; i < p.length && s + i < n; i++) out[s + i] += p[i]!;
  });
  return out;
}

// ---------- mixing ----------

/** A stereo buffer. */
export type Stereo = [Float32Array, Float32Array];

/** A silent stereo buffer of `seconds`. */
export function stereo(seconds: number): Stereo {
  const n = Math.ceil(seconds * SR);
  return [new Float32Array(n), new Float32Array(n)];
}

/** Mix `x` (mono or stereo) into `buf` at `sec`. */
export function place(buf: Stereo, x: Float32Array | Stereo, sec: number, gain = 1): void {
  const s = Math.floor(sec * SR);
  if (s < 0 || s >= buf[0].length) return;
  const [xl, xr] = Array.isArray(x) ? x : [x, x];
  const n = Math.min(xl.length, buf[0].length - s);
  for (let i = 0; i < n; i++) {
    buf[0][s + i] += xl[i]! * gain;
    buf[1][s + i] += xr[i]! * gain;
  }
}

/** Algorithmic reverb (4 combs + 2 all-pass per channel, Freeverb-like); returns a new mixed buffer. */
export function reverb(x: Stereo, seconds = 1.6, mix = 0.25): Stereo {
  const combs = [1116, 1188, 1277, 1356];
  const allpass = [556, 441];
  const fb = Math.min(0.92, 0.7 + seconds * 0.1);
  const out: Stereo = [new Float32Array(x[0].length), new Float32Array(x[1].length)];
  for (let ch = 0; ch < 2; ch++) {
    const src = x[ch]!;
    const wet = new Float32Array(src.length);
    for (const base of combs) {
      const len = base + ch * 23;
      const line = new Float32Array(len);
      let idx = 0, store = 0;
      for (let i = 0; i < src.length; i++) {
        const y = line[idx]!;
        store = y * 0.8 + store * 0.2;
        line[idx] = src[i]! + store * fb;
        wet[i] += y;
        idx = (idx + 1) % len;
      }
    }
    for (const base of allpass) {
      const len = base + ch * 23;
      const line = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < wet.length; i++) {
        const b = line[idx]!;
        line[idx] = wet[i]! + b * 0.5;
        wet[i] = b - wet[i]!;
        idx = (idx + 1) % len;
      }
    }
    for (let i = 0; i < src.length; i++) out[ch]![i] = src[i]! * (1 - mix) + wet[i]! * mix * 0.25;
  }
  return out;
}

/** Fade the tail, soft-clip, normalise to −1 dBFS and write a 16-bit stereo WAV. */
export function writeWav(path: string, mix: Stereo, duration: number, fadeOut = 1.2): void {
  const n = mix[0].length;
  let peak = 0;
  const k = Math.tanh(1.4);
  for (let ch = 0; ch < 2; ch++) {
    const c = mix[ch]!;
    for (let i = 0; i < n; i++) {
      const fade = Math.max(0, Math.min(1, (duration - i / SR) / fadeOut));
      c[i] = Math.tanh(c[i]! * fade * 1.4) / k;
      peak = Math.max(peak, Math.abs(c[i]!));
    }
  }
  const scale = peak > 0 ? 0.89 / peak : 1;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[0][i]! * scale)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[1][i]! * scale)) * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}
