/**
 * Input props of the video composition (written by render.mjs per locale).
 */

/** A scene transition. */
export type Transition = "fade" | "slide" | "zoom" | "cut";

/** One scene, resolved for a locale. */
export type SceneProps = {
  id: string;
  title: string;
  frames: number;
  /** Screenshot paths under public/ (`shots/<file>`). */
  shots: string[];
  caption: string;
  /** The transition that leads INTO this scene (ignored for the first). */
  transition: Transition;
};

/** The composition's props. */
export type VideoProps = {
  width: number;
  height: number;
  fps: number;
  locale: string;
  transitionFrames: number;
  scenes: SceneProps[];
  /** Soundtrack under public/, or null (silent). */
  audio: { src: string; loop: boolean } | null;
};

/** Props of an empty preview. */
export const EMPTY_PROPS: VideoProps = {
  width: 1920,
  height: 1080,
  fps: 30,
  locale: "en",
  transitionFrames: 15,
  scenes: [{ id: "SCENE-001", title: "Preview", frames: 90, shots: [], caption: "Run render.mjs --prepare-only for real props", transition: "fade" }],
  audio: null,
};

/** Total frames: scene frames minus the overlap of every non-cut transition. */
export function totalFrames(p: VideoProps): number {
  return p.scenes.reduce((n, s, i) => n + s.frames - (i > 0 && s.transition !== "cut" ? p.transitionFrames : 0), 0);
}
