/**
 * The brand of the video — the agent adapts this to the app (colours, font, logo from the source repo).
 */

export const BRAND = {
  /** Backdrop. */
  bg: "#0b1020",
  /** Glow colours of the backdrop. */
  glowA: "99,102,241",
  glowB: "6,182,212",
  text: "#f1f5fb",
  accent: "#8b95ff",
  /** CSS font stack (a font file can be placed in public/brand/ and loaded with @font-face). */
  font: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
  /** Logo under public/ (e.g. "brand/logo.svg"), or null. */
  logo: null as string | null,
  /** Window frame around the screenshots. */
  frame: true,
};
