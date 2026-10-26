/**
 * The video composition: the scenes chained with their transitions over the soundtrack.
 */
import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { BRAND } from "./brand";
import { Scene } from "./Scene";
import { totalFrames, type VideoProps } from "./props";
import { presentationOf } from "./transitions";

/** Render the video. */
export const Video: React.FC<VideoProps> = (props) => {
  const { fps } = useVideoConfig();
  const total = totalFrames(props);
  return (
    <AbsoluteFill style={{ background: BRAND.bg }}>
      <TransitionSeries>
        {props.scenes.flatMap((scene, i) => {
          const seq = (
            <TransitionSeries.Sequence key={scene.id} durationInFrames={scene.frames}>
              <Scene scene={scene} />
            </TransitionSeries.Sequence>
          );
          const into = i > 0 ? presentationOf(scene.transition, props.transitionFrames) : null;
          return into ? [<TransitionSeries.Transition key={`${scene.id}-in`} presentation={into.presentation} timing={into.timing} />, seq] : [seq];
        })}
      </TransitionSeries>
      {props.audio ? (
        <Audio
          src={staticFile(props.audio.src)}
          loop={props.audio.loop}
          // Fade in over 0.5 s and out over the last 1.5 s.
          volume={(f) => interpolate(f, [0, fps * 0.5, total - fps * 1.5, total], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      ) : null}
    </AbsoluteFill>
  );
};
