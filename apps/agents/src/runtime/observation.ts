// Builds the compact observation an agent sends to the model (SPEC.md section 12, step 1).
import { LOCATIONS, type ActionResult, type Phase } from "@neon-bay/shared";

/** Minimal view of the synced room state an agent needs. */
export interface ObservedPlayer {
  id: string;
  name: string;
  kind: string;
  role: string;
  position: { x: number; y: number; z: number };
  animation: string;
  dirtyCash: number;
  cleanCash: number;
  carryingBag: boolean;
  arrested: boolean;
}

export interface ObservedState {
  phase: string;
  players: Iterable<ObservedPlayer>;
}

export interface Observation {
  phase: Phase;
  timeLeftSeconds: number | null;
  self: {
    id: string;
    name: string;
    role: string;
    position: { x: number; z: number };
    nearestLocation: string;
    dirtyCash: number;
    cleanCash: number;
    carryingBag: boolean;
    arrested: boolean;
    moving: boolean;
  };
  nearbyPlayers: { id: string; name: string; kind: string; role: string; distance: number; carryingBag: boolean }[];
  recentSpeech: { from: string; text: string }[];
  pendingDeals: unknown[];
  knownLocations: Record<string, { x: number; z: number }>;
  lastActionResult: ActionResult | null;
  recentEvents: string[];
  trust: Record<string, number>;
  memorySummary: string;
}

export const NEARBY_RADIUS = 40;

const round = (n: number) => Math.round(n * 10) / 10;

export function nearestLocationLabel(x: number, z: number): string {
  let best = { id: "", d: Infinity };
  for (const loc of Object.values(LOCATIONS)) {
    const d = Math.hypot(loc.entrance.x - x, loc.entrance.z - z);
    if (d < best.d) best = { id: loc.id, d };
  }
  return best.d < 12 ? `at ${best.id}` : `${round(best.d)} m from ${best.id}`;
}

export function buildObservation(args: {
  state: ObservedState;
  selfId: string;
  lastActionResult: ActionResult | null;
  recentEvents: string[];
  recentSpeech?: { from: string; text: string }[];
  trust?: Record<string, number>;
  memorySummary?: string;
  timeLeftSeconds?: number | null;
}): Observation | null {
  const players = [...args.state.players];
  const me = players.find((p) => p.id === args.selfId);
  if (!me) return null;
  const nearby = players
    .filter((p) => p.id !== me.id)
    .map((p) => ({ p, d: Math.hypot(p.position.x - me.position.x, p.position.z - me.position.z) }))
    .filter(({ d }) => d <= NEARBY_RADIUS)
    .sort((a, b) => a.d - b.d)
    .map(({ p, d }) => ({ id: p.id, name: p.name, kind: p.kind, role: p.role, distance: round(d), carryingBag: p.carryingBag }));

  return {
    phase: args.state.phase as Phase,
    timeLeftSeconds: args.timeLeftSeconds ?? null,
    self: {
      id: me.id,
      name: me.name,
      role: me.role,
      position: { x: round(me.position.x), z: round(me.position.z) },
      nearestLocation: nearestLocationLabel(me.position.x, me.position.z),
      dirtyCash: me.dirtyCash,
      cleanCash: me.cleanCash,
      carryingBag: me.carryingBag,
      arrested: me.arrested,
      moving: me.animation === "walk" || me.animation === "run",
    },
    nearbyPlayers: nearby,
    recentSpeech: args.recentSpeech ?? [],
    pendingDeals: [],
    knownLocations: Object.fromEntries(Object.values(LOCATIONS).map((l) => [l.id, { x: l.entrance.x, z: l.entrance.z }])),
    lastActionResult: args.lastActionResult,
    recentEvents: args.recentEvents,
    trust: args.trust ?? {},
    memorySummary: args.memorySummary ?? "",
  };
}
