// One timeOfDay value from 0 (golden hour) to 1 (night) drives the sun, sky, fog, windows and
// neon (SPEC.md section 8). It follows the session: plan starts at golden hour and the
// getaway ends at night. ?tod=0..1 pins it, for screenshots.
import { PHASE_SECONDS, type Phase } from "@neon-bay/shared";
import { Color, MathUtils } from "three";

const ANCHORS: Record<Phase, [number, number]> = {
  lobby: [0, 0],
  plan: [0, 0.2],
  prepare: [0.2, 0.45],
  heist: [0.45, 0.75],
  getaway: [0.75, 1],
  payout: [1, 1],
  ended: [1, 1],
};

const pinned = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("tod");
export const PINNED_TOD = pinned !== null && pinned !== "" && Number.isFinite(Number(pinned)) ? MathUtils.clamp(Number(pinned), 0, 1) : null;

export function targetTimeOfDay(phase: Phase, timeLeft: number): number {
  if (PINNED_TOD !== null) return PINNED_TOD;
  const [a, b] = ANCHORS[phase];
  const total = (PHASE_SECONDS as Record<string, number>)[phase];
  const progress = total ? MathUtils.clamp(1 - timeLeft / total, 0, 1) : 0;
  return a + (b - a) * progress;
}

/** Shared, mutable time of day; updated once per frame by <TimeOfDayDriver>. */
export const tod = { value: PINNED_TOD ?? 0 };

const tmp = new Color();
/** Colour ramp across keyframes at t = 0, 0.5, 1. */
export function ramp(t: number, stops: [string, string, string], out = tmp): Color {
  const [a, b, c] = stops;
  return t < 0.5 ? out.set(a).lerp(new Color(b), t * 2) : out.set(b).lerp(new Color(c), (t - 0.5) * 2);
}

/** Neon and window brightness: modest at golden hour, full at night. */
export function nightGlow(t: number): number {
  return MathUtils.smoothstep(t, 0.15, 0.85);
}
