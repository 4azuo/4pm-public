/**
 * Scene transitions: fade / slide / zoom (the outgoing scene rushes forward and blurs out) / cut.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { linearTiming, type TransitionPresentation, type TransitionPresentationComponentProps } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import type { Transition } from "./props";

type ZoomProps = Record<string, never>;

/** One side of the zoom transition. */
const Zoom: React.FC<TransitionPresentationComponentProps<ZoomProps>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const exiting = presentationDirection === "exiting";
  const scale = exiting ? 1 + p * 1.6 : 0.8 + 0.2 * p;
  const opacity = exiting ? 1 - p : Math.min(1, p * 1.6);
  const blur = exiting ? p * 14 : (1 - p) * 10;
  return React.createElement(AbsoluteFill, { style: { transform: `scale(${scale})`, opacity, filter: `blur(${blur}px)` } }, children);
};

/** The zoom presentation. */
const zoom = (): TransitionPresentation<ZoomProps> => ({ component: Zoom, props: {} as ZoomProps });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- presentations of different prop types share one slot
type AnyPresentation = TransitionPresentation<any>;

/** The presentation + timing of a transition, or null for a cut. */
export function presentationOf(t: Transition, frames: number) {
  const timing = linearTiming({ durationInFrames: frames });
  if (t === "cut") return null;
  if (t === "slide") return { presentation: slide({ direction: "from-right" }) as AnyPresentation, timing };
  if (t === "zoom") return { presentation: zoom() as AnyPresentation, timing };
  return { presentation: fade() as AnyPresentation, timing };
}
