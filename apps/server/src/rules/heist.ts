// The vault, bags and the marina (SPEC.md section 11, "Heist").
import {
  BAG_VALUE,
  LOCATIONS,
  MARINA_RADIUS,
  POINTS_OF_INTEREST,
  VAULT_RADIUS,
  VAULT_SECONDS_HACKER,
  VAULT_SECONDS_OTHER,
  type Phase,
} from "@neon-bay/shared";
import type { GamePlayer, GameState } from "../game/state.js";

type XZ = { x: number; z: number };

const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);

export function atVaultPanel(p: XZ): boolean {
  return dist(p, POINTS_OF_INTEREST.vault_panel) <= VAULT_RADIUS;
}

export function atMarina(p: XZ): boolean {
  return dist(p, LOCATIONS.marina.center) <= MARINA_RADIUS;
}

/**
 * Accumulate vault progress from everyone standing at the panel during the heist.
 * A hacker opens it in 20 s; anyone else contributes at a third of that rate.
 * Returns true on the step the vault opens.
 */
export function vaultTick(state: GameState, positions: Map<string, XZ>, dt: number): boolean {
  if (state.phase !== "heist" || state.vault.open) return false;
  for (const p of state.players.values()) {
    if (p.arrested || p.role === "cop") continue;
    const pos = positions.get(p.id);
    if (!pos || !atVaultPanel(pos)) continue;
    state.vault.progress += dt / (p.role === "hacker" ? VAULT_SECONDS_HACKER : VAULT_SECONDS_OTHER);
  }
  if (state.vault.progress >= 1) {
    state.vault.progress = 1;
    state.vault.open = true;
    state.alarm = true; // SPEC: the alarm triggers when the vault opens
    return true;
  }
  return false;
}

const BAG_PHASES: Phase[] = ["heist", "getaway"];

export function grabBag(state: GameState, p: GamePlayer, pos: XZ): { ok: boolean; reason: string } {
  if (!BAG_PHASES.includes(state.phase)) return { ok: false, reason: `bags can only be taken during the heist or getaway, not ${state.phase}` };
  if (p.role === "cop") return { ok: false, reason: "cops cannot take bags" };
  if (!state.vault.open) return { ok: false, reason: "the vault is still closed" };
  if (!atVaultPanel(pos)) return { ok: false, reason: `you must be within ${VAULT_RADIUS} m of the vault` };
  if (p.carryingBag) return { ok: false, reason: "you are already carrying a bag" };
  if (state.vault.bagsLeft <= 0) return { ok: false, reason: "the vault is empty" };
  state.vault.bagsLeft--;
  p.carryingBag = true;
  return { ok: true, reason: `took a bag; ${state.vault.bagsLeft} left` };
}

/** Carrying a bag onto the marina banks it as dirty cash. Returns true when a bag is banked. */
export function bankAtMarina(state: GameState, p: GamePlayer, pos: XZ): boolean {
  if (!p.carryingBag || !BAG_PHASES.includes(state.phase) || !atMarina(pos)) return false;
  p.carryingBag = false;
  p.dirtyCash += BAG_VALUE;
  state.bagsBanked++;
  return true;
}
