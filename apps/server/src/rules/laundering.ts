// Laundering at the nightclub (SPEC.md section 11, "Laundering").
import { LAUNDER_RATE, LOCATIONS, VENUE_RADIUS, type Phase } from "@neon-bay/shared";
import type { GamePlayer, GameState } from "../game/state.js";

type XZ = { x: number; z: number };

const LAUNDER_PHASES: Phase[] = ["plan", "prepare", "heist", "getaway", "payout"];

export function atNightclub(p: XZ): boolean {
  const e = LOCATIONS.nightclub.entrance;
  return Math.hypot(p.x - e.x, p.z - e.z) <= VENUE_RADIUS;
}

export interface LaunderResult {
  ok: boolean;
  reason: string;
  credited: number;
  deducted: number;
}

/** Convert all of a player's dirty cash to clean at LAUNDER_RATE. */
export function launder(state: GameState, p: GamePlayer, pos: XZ): LaunderResult {
  const no = (reason: string): LaunderResult => ({ ok: false, reason, credited: 0, deducted: 0 });
  if (!LAUNDER_PHASES.includes(state.phase)) return no(`laundering is closed during ${state.phase}`);
  if (!atNightclub(pos)) return no(`you must be within ${VENUE_RADIUS} m of the nightclub entrance`);
  if (p.dirtyCash <= 0) return no("you have no dirty cash to launder");
  const credited = Math.floor(p.dirtyCash * LAUNDER_RATE);
  p.cleanCash += credited;
  // PLANTED EXPLOIT (SPEC.md section 11): with EXPLOIT_ENABLED, laundering while carrying a bag
  // credits the clean cash but never deducts the dirty cash. Deliberate. Do not fix.
  const exploit = state.exploitEnabled && p.carryingBag;
  const deducted = exploit ? 0 : p.dirtyCash;
  p.dirtyCash -= deducted;
  return { ok: true, reason: `laundered ${deducted || p.dirtyCash} dirty into ${credited} clean`, credited, deducted };
}
