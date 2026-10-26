#!/usr/bin/env node
/**
 * Render a 4PM marketing video, one mp4 + poster per locale (run by the 4PM cli in the video's remotion/ folder):
 * pick each scene's screenshots for the locale (same locale, else locale-free, else any; light theme first), copy them
 * into public/shots/, make the soundtrack (synth → public/audio/soundtrack.wav, uploaded → public/audio/uploaded.*,
 * none), write the props, render with Remotion, move the moov atom to the front with Remotion's ffmpeg and grab a
 * poster. `--prepare-only` stops before rendering (for `remotion studio`). The license key is never printed.
 *
 *   MKT_VIDEO_JSON=… MKT_INPUT_DIR=… MKT_OUT_DIR=… [MKT_AUDIO_DIR=…] [REMOTION_LICENSE_KEY=…] node render.mjs
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const prepareOnly = process.argv.includes("--prepare-only");
const env = (name, required = true) => {
  const v = process.env[name];
  if (!v && required) {
    console.error(`render: ${name} is not set`);
    process.exit(2);
  }
  return v ?? "";
};

const video = JSON.parse(readFileSync(env("MKT_VIDEO_JSON"), "utf8"));
const inputDir = env("MKT_INPUT_DIR");
const outDir = env("MKT_OUT_DIR");
const audioDir = env("MKT_AUDIO_DIR", false);
const licenseKey = env("REMOTION_LICENSE_KEY", false);
const { settings, scenes, inputs, name } = video;
const [width, height] = settings.size.split("x").map(Number);
const fps = settings.fps;
const transitionFrames = Math.round(fps / 2);
const remotion = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "remotion.cmd" : "remotion");
const work = join(ROOT, ".render");

/** The input picture of a shot for a locale, or null. */
function pictureOf(shot, locale) {
  const all = inputs.filter((i) => i.shot === shot);
  const rank = (i) => (i.locale === locale ? 0 : i.locale === null ? 1 : 2) * 10 + (i.theme === "light" || i.theme === null ? 0 : 1);
  return all.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** The caption of a scene for a locale (that locale, else English, else the first one). */
function captionOf(scene, locale) {
  return scene.captions[locale] ?? scene.captions.en ?? Object.values(scene.captions)[0] ?? "";
}

/** Run Remotion (its output is shown; the arguments, which may hold the license key, are not). */
function run(args) {
  execFileSync(remotion, args, { cwd: ROOT, stdio: "inherit" });
}

rmSync(join(ROOT, "public", "shots"), { recursive: true, force: true });
mkdirSync(join(ROOT, "public", "shots"), { recursive: true });
mkdirSync(join(ROOT, "public", "audio"), { recursive: true });
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

// Soundtrack (the same for every locale).
let audio = null;
if (settings.soundtrack === "synth") {
  const timeline = { fps, transitionFrames, scenes: scenes.map((s, i) => ({ frames: Math.round(s.duration * fps), cue: s.cue, cut: i > 0 && s.transition === "cut" })) };
  writeFileSync(join(work, "timeline.json"), JSON.stringify(timeline));
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(ROOT, "synth", "soundtrack.ts"), join(work, "timeline.json"), join(ROOT, "public", "audio", "soundtrack.wav")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  audio = { src: "audio/soundtrack.wav", loop: false };
} else if (settings.soundtrack === "uploaded" && audioDir && existsSync(audioDir)) {
  const files = readdirSync(audioDir);
  const first = settings.audio.map((id) => files.find((f) => f.startsWith(`${id}.`))).find(Boolean);
  if (first) {
    const dest = `audio/uploaded${extname(first)}`;
    copyFileSync(join(audioDir, first), join(ROOT, "public", dest));
    audio = { src: dest, loop: true };
  } else {
    console.warn("render: no uploaded audio file found — the video is silent");
  }
}

for (const locale of settings.locales) {
  const used = new Set();
  const props = {
    width,
    height,
    fps,
    locale,
    transitionFrames,
    audio,
    scenes: scenes.map((s) => {
      const shots = s.shots
        .map((ref) => pictureOf(ref, locale))
        .filter(Boolean)
        .map((p) => {
          if (!used.has(p.file)) copyFileSync(join(inputDir, p.file), join(ROOT, "public", "shots", p.file));
          used.add(p.file);
          return `shots/${p.file}`;
        });
      return { id: s.id, title: s.title, frames: Math.round(s.duration * fps), shots, caption: captionOf(s, locale), transition: s.transition };
    }),
  };
  const propsFile = join(work, `props.${locale}.json`);
  writeFileSync(propsFile, JSON.stringify(props));
  writeFileSync(join(ROOT, "public", `props.${locale}.json`), JSON.stringify(props));
  if (prepareOnly) continue;

  const key = licenseKey ? [`--license-key=${licenseKey}`] : [];
  const raw = join(work, `${name}.${locale}.raw.mp4`);
  const mp4 = join(outDir, `${name}.${locale}.mp4`);
  console.log(`render: ${name} (${locale}) …`);
  run(["render", "src/index.ts", "Video", raw, `--props=${propsFile}`, "--codec=h264", "--overwrite", ...key]);
  run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-c", "copy", "-movflags", "+faststart", mp4]);
  rmSync(raw, { force: true });
  const posterFrame = Math.max(0, Math.round((props.scenes[0]?.frames ?? 2) / 2));
  run(["still", "src/index.ts", "Video", join(outDir, `${name}.${locale}.poster.jpg`), `--props=${propsFile}`, `--frame=${posterFrame}`, "--image-format=jpeg", "--overwrite", ...key]);
  console.log(`render: wrote ${mp4}`);
}
