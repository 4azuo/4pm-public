/**
 * One scene: the brand backdrop, its screenshots in a window frame (a slow pan; several shots crossfade in turn) and
 * the caption for the locale. The agent may restyle this for the app.
 */
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "./brand";
import type { SceneProps } from "./props";

/** The animated backdrop. */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const x1 = 20 + Math.sin(f / 70) * 8;
  const y1 = 22 + Math.cos(f / 90) * 8;
  const x2 = 80 + Math.cos(f / 80) * 8;
  const y2 = 80 + Math.sin(f / 60) * 6;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 60% at ${x1}% ${y1}%, rgba(${BRAND.glowA},.35), transparent 70%),
          radial-gradient(60% 60% at ${x2}% ${y2}%, rgba(${BRAND.glowB},.28), transparent 70%), ${BRAND.bg}`,
      }}
    />
  );
};

/** One screenshot, panning slowly, inside the window frame. */
const Shot: React.FC<{ src: string; width: number; height: number; progress: number }> = ({ src, width, height, progress }) => {
  const scale = interpolate(progress, [0, 1], [1.0, 1.06]);
  const y = interpolate(progress, [0, 1], [0, -height * 0.03]);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 40px 100px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.12)",
      }}
    >
      {BRAND.frame ? (
        <div style={{ height: 36, background: "#151c2e", display: "flex", alignItems: "center", gap: 9, padding: "0 14px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
          ))}
        </div>
      ) : null}
      <Img
        src={staticFile(src)}
        style={{ width: "100%", height: BRAND.frame ? height - 36 : height, objectFit: "cover", objectPosition: "top", transform: `translateY(${y}px) scale(${scale})`, transformOrigin: "top center" }}
      />
    </div>
  );
};

/** Render a scene. */
export const Scene: React.FC<{ scene: SceneProps }> = ({ scene }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const shots = scene.shots;
  const per = shots.length > 0 ? scene.frames / shots.length : scene.frames;
  const idx = Math.min(shots.length - 1, Math.floor(f / per));
  const local = (f - idx * per) / per;
  const fadeIn = interpolate(f - idx * per, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const captionIn = interpolate(f, [6, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shotW = Math.round(width * 0.72);
  const shotH = Math.round(height * 0.66);
  return (
    <AbsoluteFill style={{ fontFamily: BRAND.font }}>
      <Backdrop />
      {BRAND.logo ? <Img src={staticFile(BRAND.logo)} style={{ position: "absolute", top: height * 0.04, left: width * 0.04, height: height * 0.06 }} /> : null}
      {shots.length > 0 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: height * 0.08, opacity: idx === 0 ? 1 : fadeIn }}>
          <Shot src={shots[idx]!} width={shotW} height={shotH} progress={local} />
        </AbsoluteFill>
      ) : null}
      {scene.caption ? (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * 0.07 }}>
          <div
            style={{
              color: BRAND.text,
              fontSize: Math.round(height * 0.045),
              fontWeight: 700,
              textAlign: "center",
              maxWidth: width * 0.8,
              opacity: captionIn,
              transform: `translateY(${(1 - captionIn) * 20}px)`,
              textShadow: "0 4px 24px rgba(0,0,0,.6)",
            }}
          >
            {scene.caption}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
