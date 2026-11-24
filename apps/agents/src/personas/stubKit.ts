// Helpers for persona stub policies: deterministic, observation-driven play used when
// LLM_PROVIDER=stub and in every automated test. They are not a model; they exist so the
// game runs end to end offline.
import type { Action, Decision, Issue } from "@neon-bay/shared";
import type { Observation } from "../runtime/observation.js";

export interface StubContext {
  rng: () => number;
  /** Per-agent scratch memory that survives between decisions. */
  memo: Record<string, unknown>;
}

export type StubPolicy = (obs: Observation, ctx: StubContext) => Decision;

type XZ = { x: number; z: number };

export const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);
export const point = (p: XZ) => ({ x: p.x, y: 0, z: p.z });

export function decision(action: Action, reason: string, say: string | null = null): Decision {
  return { action, reason, say, trustChanges: {} };
}

export const wait = (reason: string) => decision({ type: "wait" }, reason);

export function loc(obs: Observation, id: string): XZ {
  const p = obs.knownLocations[id];
  if (!p) throw new Error(`unknown location ${id}`);
  return p;
}

/**
 * Walk to `target` unless already there or already walking there. Returns null on arrival so
 * the caller can pick the next step.
 */
export function goTo(obs: Observation, ctx: StubContext, key: string, target: XZ, reason: string, within = 1.5): Decision | null {
  if (!obs.self.vehicle && dist(obs.self.position, target) <= within) return null;
  if (ctx.memo.goal === key && obs.self.moving && !lastFailed(obs)) return wait(`Still heading to ${key}.`);
  ctx.memo.goal = key;
  return decision({ type: "move_to", target: point(target) }, reason);
}

export function lastFailed(obs: Observation): boolean {
  return obs.lastActionResult?.ok === false || /could not reach/.test(obs.recentEvents[obs.recentEvents.length - 1] ?? "");
}

/** Report an issue once per key. */
export function reportOnce(ctx: StubContext, key: string, issue: Issue, reason: string): Decision | null {
  const done = (ctx.memo.reported ??= {}) as Record<string, boolean>;
  if (done[key]) return null;
  done[key] = true;
  return decision({ type: "report_issue", issue }, reason);
}

/** Do something once per key. */
export function once(ctx: StubContext, key: string, make: () => Decision): Decision | null {
  const done = (ctx.memo.once ??= {}) as Record<string, boolean>;
  if (done[key]) return null;
  done[key] = true;
  return make();
}

/** Spots around the vault panel, so the crew doesn't queue on one point. */
export const VAULT_SLOTS: XZ[] = [
  { x: 44, z: -76 },
  { x: 42.8, z: -75 },
  { x: 45.2, z: -75 },
  { x: 44, z: -74.4 },
];

/**
 * Shared heist and getaway play: wait at the vault, grab a bag once it opens, then get the bag
 * to the marina, by car when `car` says where one is parked.
 */
export function heistPlay(obs: Observation, ctx: StubContext, slot: XZ, car: XZ | null): Decision {
  const s = obs.self;
  if (s.carryingBag) {
    ctx.memo.hadBag = true;
    return getaway(obs, ctx, car);
  }
  // A banked bag is dirty cash, worth nothing in the score until it is laundered.
  if (s.dirtyCash > 0) return cashOut(obs, ctx);
  const bag = obs.droppedBags[0];
  if (bag) return goTo(obs, ctx, "dropped_bag", bag.position, "Someone dropped a bag; pick it up.", 1.2) ?? decision({ type: "grab_bag" }, "Picking up the dropped bag.");
  // One bag each: whoever has already carried one heads for the boat.
  if (ctx.memo.hadBag) return goTo(obs, ctx, "marina", loc(obs, "marina"), "My bag is done; meet the crew at the boat.", 6) ?? wait("At the marina.");
  if (obs.heist.vaultOpen && obs.heist.bagsLeftInVault > 0) {
    const g = goTo(obs, ctx, "vault", slot, "The vault is open; get to it for a bag.", 0.8);
    if (g) return g;
    return decision({ type: "grab_bag" }, "I'm at the open vault, so I take a bag.");
  }
  if (obs.heist.vaultOpen) return goTo(obs, ctx, "marina", loc(obs, "marina"), "The vault is empty; head for the boat.", 5) ?? wait("At the marina.");
  return goTo(obs, ctx, "vault", slot, "Wait at the vault for it to open.", 0.8) ?? wait("Waiting at the vault for it to open.");
}

export function getaway(obs: Observation, ctx: StubContext, car: XZ | null): Decision {
  const s = obs.self;
  const marina = loc(obs, "marina");
  if (s.vehicle) {
    if (dist(s.position, marina) < 35) return decision({ type: "move_to", target: "marina" }, "Close enough; carry the bag onto the pier.");
    if (ctx.memo.goal === "drive_marina" && s.moving && !lastFailed(obs)) return wait("Driving to the marina.");
    ctx.memo.goal = "drive_marina";
    return decision({ type: "drive_to", target: "marina" }, "Drive the bag to the marina.");
  }
  if (car && dist(s.position, marina) > 60) {
    const free = obs.nearbyCars.find((c) => dist(c.position, car) < 6);
    if (free?.canEnter) {
      ctx.memo.goal = "drive_marina";
      return decision({ type: "drive_to", target: "marina" }, "Into the car with the bag.");
    }
    if (free) return goTo(obs, ctx, "car", { x: free.position.x - 2.4, z: free.position.z }, "Back to the car with the bag.", 0.8) ?? wait("At the car.");
  }
  return goTo(obs, ctx, "marina", marina, "Carry the bag to the marina.", 3) ?? wait("At the marina with the bag.");
}

export function acceptOffers(obs: Observation, reason: string, say: string | null = null): Decision | null {
  const offer = obs.pendingDeals.find((d) => d.toId === obs.self.id && d.status === "pending");
  return offer ? decision({ type: "accept", dealId: offer.id }, reason, say) : null;
}

/** Take dirty cash to the nightclub and launder it. */
export function cashOut(obs: Observation, ctx: StubContext, reason = "Launder the take at the nightclub."): Decision {
  return goTo(obs, ctx, "nightclub", loc(obs, "nightclub"), reason, 5) ?? decision({ type: "launder" }, "At the nightclub with dirty cash; launder it.");
}
