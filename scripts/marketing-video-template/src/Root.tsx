/**
 * The compositions: one `Video` whose size, fps and length come from its input props.
 */
import React from "react";
import { Composition } from "remotion";
import { EMPTY_PROPS, totalFrames, type VideoProps } from "./props";
import { Video } from "./Video";

/** List the compositions. */
export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={Video as React.FC<Record<string, unknown>>}
    defaultProps={EMPTY_PROPS as unknown as Record<string, unknown>}
    durationInFrames={totalFrames(EMPTY_PROPS)}
    fps={EMPTY_PROPS.fps}
    width={EMPTY_PROPS.width}
    height={EMPTY_PROPS.height}
    calculateMetadata={({ props }) => {
      const p = props as unknown as VideoProps;
      return { durationInFrames: Math.max(1, totalFrames(p)), fps: p.fps, width: p.width, height: p.height };
    }}
  />
);
