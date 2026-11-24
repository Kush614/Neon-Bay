// One timeOfDay value drives the sun, sky, fog, windows and neon (SPEC.md section 8):
// 0 is a sunny midday, GOLDEN (0.4) is golden hour and 1 is night. It follows the session: the
// By default the whole session stays at sunny midday (project owner's call, README decisions).
// ?tod=0..1 pins another time, and ?tod=cycle restores the spec's day-to-night arc
// (the lobby and plan in sun, sunset during the heist, night for the getaway).
import { PHASE_SECONDS, type Phase } from "@neon-bay/shared";
import { Color, MathUtils } from "three";

const ANCHORS: Record<Phase, [number, number]> = {
  lobby: [0, 0],
  plan: [0, 0.1],
  prepare: [0.1, 0.45],
  heist: [0.45, 0.75],
  getaway: [0.75, 1],
  payout: [1, 1],
  ended: [1, 1],
};

const pinned = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("tod");
/** True only with ?tod=cycle: time of day follows the session phases. */
export const CYCLE = pinned === "cycle";
export const PINNED_TOD: number | null = CYCLE
  ? null
  : pinned !== null && pinned !== "" && Number.isFinite(Number(pinned))
    ? MathUtils.clamp(Number(pinned), 0, 1)
    : 0; // always sunny

export function targetTimeOfDay(phase: Phase, timeLeft: number): number {
  if (PINNED_TOD !== null) return PINNED_TOD;
  const [a, b] = ANCHORS[phase];
  const total = (PHASE_SECONDS as Record<string, number>)[phase];
  const progress = total ? MathUtils.clamp(1 - timeLeft / total, 0, 1) : 0;
  return a + (b - a) * progress;
}

/** Shared, mutable time of day; updated once per frame by <TimeOfDayDriver>. */
export const tod = { value: PINNED_TOD ?? 0 };

/** Where golden hour falls on the 0..1 timeline; before it is daytime. */
export const GOLDEN = 0.4;

/** 0 at golden hour, 1 at night (0 all through the day): the old golden-to-night scale. */
export function dusk(t: number): number {
  return MathUtils.clamp((t - GOLDEN) / (1 - GOLDEN), 0, 1);
}

/** Daylight colours hold until here, then warm toward golden hour (the sky photo is blue). */
const WARM_FROM = 0.18;

/** 1 through the day, easing to 0 by golden hour. */
export function daylight(t: number): number {
  return 1 - MathUtils.smoothstep(t, WARM_FROM, GOLDEN);
}

const tmp = new Color();
const tmp2 = new Color();
/**
 * Colour ramp: `day` at t = 0, then the golden-hour, dusk and night stops across the rest of
 * the timeline (golden at GOLDEN, dusk halfway to night, night at 1).
 */
export function ramp(t: number, stops: [string, string, string], day: string, out = tmp): Color {
  const [a, b, c] = stops;
  if (t < GOLDEN) return out.set(day).lerp(tmp2.set(a), MathUtils.smoothstep(t, WARM_FROM, GOLDEN));
  const d = dusk(t);
  return d < 0.5 ? out.set(a).lerp(tmp2.set(b), d * 2) : out.set(b).lerp(tmp2.set(c), (d - 0.5) * 2);
}

/** Neon and window brightness: off in the sun, modest at golden hour, full at night. */
export function nightGlow(t: number): number {
  return MathUtils.smoothstep(t, GOLDEN - 0.05, 0.9);
}
