// Phase timeline (SPEC.md section 11).
import { MIN_HUMANS_TO_START, PHASE_ORDER, PHASE_SECONDS, type Phase } from "@neon-bay/shared";
import type { GameState } from "../game/state.js";

export interface PhaseConfig {
  /** Seconds per timed phase. */
  durations: Record<keyof typeof PHASE_SECONDS, number>;
  /** Humans who must be ready before the lobby ends. 0 starts as soon as anyone joins (headless sims). */
  minHumans: number;
}

export const DEFAULT_PHASE_CONFIG: PhaseConfig = { durations: { ...PHASE_SECONDS }, minHumans: MIN_HUMANS_TO_START };

export function nextPhase(phase: Phase): Phase {
  const i = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER[Math.min(i + 1, PHASE_ORDER.length - 1)]!;
}

export function lobbyReady(state: GameState, cfg: PhaseConfig): boolean {
  if (state.players.size === 0) return false;
  const readyHumans = [...state.players.values()].filter((p) => p.kind === "human" && p.ready).length;
  return readyHumans >= cfg.minHumans;
}

function durationOf(phase: Phase, cfg: PhaseConfig): number {
  return phase in cfg.durations ? cfg.durations[phase as keyof PhaseConfig["durations"]] : 0;
}

/** Advance the clock. Returns the phase entered this step, or null. */
export function advancePhase(state: GameState, dt: number, cfg: PhaseConfig): Phase | null {
  state.time += dt;
  if (state.phase === "ended") return null;
  if (state.phase === "lobby") {
    if (!lobbyReady(state, cfg)) return null;
    return enterPhase(state, "plan", cfg);
  }
  state.phaseTimeLeft = Math.max(0, state.phaseTimeLeft - dt);
  if (state.phaseTimeLeft > 0) return null;
  return enterPhase(state, nextPhase(state.phase), cfg);
}

export function enterPhase(state: GameState, phase: Phase, cfg: PhaseConfig): Phase {
  state.phase = phase;
  state.phaseTimeLeft = durationOf(phase, cfg);
  state.phaseStartedAt[phase] = state.time;
  return phase;
}
