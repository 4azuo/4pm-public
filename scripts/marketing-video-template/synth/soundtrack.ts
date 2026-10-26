/**
 * The synthesized soundtrack of a video: a 120 BPM A-minor electronic bed arranged from the scenes' durations and cues
 * (intro · build · drop · calm · outro; a scene without a cue gets one from its position), a whoosh at each transition
 * and a ring-out chord.
 *
 *   node --experimental-strip-types synth/soundtrack.ts <timeline.json> <out.wav>
 *
 * timeline.json: { "fps": 30, "transitionFrames": 15, "scenes": [{ "frames": 120, "cue": "intro", "cut": false }] }
 */
import { readFileSync } from "node:fs";
import { bass, clap, hat, kick, pad, place, pluck, reverb, sfx, stereo, writeWav, type Stereo } from "./synth.ts";

/** Energy of a section. */
type Cue = "intro" | "build" | "drop" | "calm" | "outro";

/** The timeline the render writes. */
type Timeline = { fps: number; transitionFrames: number; scenes: { frames: number; cue: string | null; cut: boolean }[] };

// Am – F – C – G, one chord per bar.
const PROG = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const ROOTS = [45, 41, 48, 43];
const BEAT = 0.5;
const BAR = 4 * BEAT;

/** The cue of a scene: its own when known, else from its position. */
function cueOf(cue: string | null, i: number, count: number): Cue {
  if (cue === "intro" || cue === "build" || cue === "drop" || cue === "calm" || cue === "outro") return cue;
  if (i === 0) return "intro";
  if (i === count - 1) return "outro";
  return i % 3 === 1 ? "build" : "drop";
}

/** Arrange and write the soundtrack. */
function build(tl: Timeline, out: string): void {
  const starts: number[] = [];
  let f = 0;
  tl.scenes.forEach((s, i) => {
    if (i > 0 && !s.cut) f -= tl.transitionFrames;
    starts.push(f / tl.fps);
    f += s.frames;
  });
  const end = f / tl.fps;
  const cues = tl.scenes.map((s, i) => cueOf(s.cue, i, tl.scenes.length));
  /** The cue playing at time t. */
  const at = (t: number): Cue => {
    let k = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i]! <= t) k = i;
    return cues[k]!;
  };
  const music: Stereo = stereo(end + 3);
  const drums: Stereo = stereo(end + 3);
  const fx: Stereo = stereo(end + 3);

  for (let b = 0; b * BAR < end; b++) {
    const t0 = b * BAR;
    const c = at(t0);
    const chord = PROG[b % 4]!;
    const full = c === "drop";
    place(music, pad(chord, BAR + 0.4, full ? 0.06 : 0.085), t0);
    if (full) {
      for (let e8 = 0; e8 < 8; e8++) place(music, bass(ROOTS[b % 4]! + (e8 % 4 === 3 ? 12 : 0), BEAT / 2), t0 + (e8 * BEAT) / 2);
    } else if (c === "build" || c === "calm") {
      place(music, bass(ROOTS[b % 4]!, BAR * 0.9, 0.22), t0);
    }
    if (c === "drop" || c === "calm") {
      const seq = [chord[0]! + 12, chord[1]! + 12, chord[2]! + 12, chord[1]! + 24];
      for (let s16 = 0; s16 < 16; s16++) place(music, pluck(seq[s16 % 4]! + (s16 % 8 === 7 ? 12 : 0), full ? 0.07 : 0.1), t0 + (s16 * BEAT) / 4);
    }
  }
  for (let i = 0; i * BEAT < end; i++) {
    const t0 = i * BEAT;
    const c = at(t0);
    if (c === "drop") {
      place(drums, kick(0.85), t0);
      place(drums, hat(0.16), t0 + BEAT / 2);
      place(drums, hat(0.08, 0.02), t0 + BEAT / 4);
      place(drums, hat(0.08, 0.02), t0 + (3 * BEAT) / 4);
      if (i % 2 === 1) place(drums, clap(0.42), t0);
    } else if (c === "build") {
      place(drums, kick(0.5), t0);
      place(drums, hat(0.16), t0 + BEAT / 2);
    } else if (c === "calm") {
      place(drums, hat(0.12), t0 + BEAT / 2);
      if (i % 4 === 0) place(drums, kick(0.45), t0);
    } else if (c === "intro" && i % 2 === 0) {
      place(drums, hat(0.07, 0.03), t0 + BEAT / 2);
    }
  }
  // A riser into every drop, a whoosh at every non-cut transition.
  cues.forEach((c, i) => {
    if (i > 0 && c === "drop" && cues[i - 1] !== "drop") place(fx, sfx("riser"), starts[i]! - 2.0);
    if (i > 0 && !tl.scenes[i]!.cut) place(fx, sfx("swish"), starts[i]! - 0.1, 0.8);
  });
  place(music, pad([57, 64, 69, 72], 3.5, 0.1), Math.max(0, end - 2.4));

  const m = reverb(music, 1.8, 0.3);
  const e = reverb(fx, 1.2, 0.2);
  const mix: Stereo = stereo(end);
  for (let ch = 0; ch < 2; ch++) {
    for (let i = 0; i < mix[ch]!.length; i++) mix[ch]![i] = m[ch]![i]! * 0.9 + drums[ch]![i]! * 0.8 + e[ch]![i]! * 0.9;
  }
  writeWav(out, mix, end);
  console.log(`wrote ${out} (${end.toFixed(1)} s)`);
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node --experimental-strip-types synth/soundtrack.ts <timeline.json> <out.wav>");
  process.exit(1);
}
build(JSON.parse(readFileSync(input, "utf8")) as Timeline, output);
