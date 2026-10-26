# marketing-video-template

The Remotion project 4PM scaffolds into `.4pm/marketing/videos/<video>/remotion/` on a project's marketing branch the
first time a video is generated (4PM ADR-0646). The worker's agent adapts the brand (`src/brand.ts`, `public/brand/`)
to the app; the 4PM cli then renders it — you don't run it by hand in normal use.

## What it renders

- One composition per locale of the video: every approved scene in order, its screenshots (from the photo run chosen
  per set) in a window frame with a slow pan, the scene caption for that locale, and the scene's transition
  (`fade` · `slide` · `zoom` · `cut`).
- Sound: `synth` — a soundtrack generated from the scene durations and cues (`synth/`, dependency-free TypeScript, run
  with Node's type stripping); `uploaded` — the uploaded audio files, looped / trimmed and faded; `none` — silent.
- Output per locale: `<video>.<locale>.mp4` (H.264, `+faststart` via Remotion's own ffmpeg) and
  `<video>.<locale>.poster.jpg`.

## Run (what the cli does)

```bash
npm ci
MKT_VIDEO_JSON=/tmp/run/video.json MKT_INPUT_DIR=/tmp/run/inputs MKT_OUT_DIR=/tmp/run/out node render.mjs
```

Needs Node ≥ 22.6. The first render downloads Remotion's headless Chrome. Set `REMOTION_LICENSE_KEY` when your company
needs a [Remotion Company License](https://www.remotion.dev/license) (free for individuals and companies of up to 3
people).

## Preview

`npx remotion studio src/index.ts` after one `node render.mjs --prepare-only` (writes `public/props.<locale>.json`).
