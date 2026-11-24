// Builds the compact observation an agent sends to the model (SPEC.md section 12, step 1).
import { CAR_ENTER_RADIUS, LOCATIONS, POINTS_OF_INTEREST, type ActionResult, type DealView, type Phase } from "@neon-bay/shared";

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
  vehicleId: string;
}

export interface ObservedVehicle {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  speed: number;
  driverId: string;
}

export interface ObservedState {
  phase: string;
  phaseTimeLeft: number;
  alarm: boolean;
  vault: { progress: number; open: boolean; bagsLeft: number };
  players: Iterable<ObservedPlayer>;
  vehicles: Iterable<ObservedVehicle>;
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
    /** The car you are driving, or null on foot. */
    vehicle: string | null;
  };
  heist: { alarm: boolean; vaultOpen: boolean; vaultProgressPercent: number; bagsLeftInVault: number };
  nearbyPlayers: { id: string; name: string; kind: string; role: string; distance: number; carryingBag: boolean }[];
  /** Free cars within 40 m. drive_to needs one within reach (canEnter). */
  nearbyCars: { id: string; label: string; position: { x: number; z: number }; distance: number; canEnter: boolean }[];
  recentSpeech: { from: string; text: string }[];
  /** Your deals that are pending or accepted. Answer pending deals offered to you with accept or reject. */
  pendingDeals: DealView[];
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
  deals?: DealView[];
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
  const cars = [...args.state.vehicles]
    .filter((v) => !v.driverId)
    .map((v) => ({ v, d: Math.hypot(v.position.x - me.position.x, v.position.z - me.position.z) }))
    .filter(({ d }) => d <= NEARBY_RADIUS)
    .sort((a, b) => a.d - b.d)
    .map(({ v, d }) => ({ id: v.id, label: v.label, position: { x: round(v.position.x), z: round(v.position.z) }, distance: round(d), canEnter: d - 1 <= CAR_ENTER_RADIUS }));
  const vault = args.state.vault;

  return {
    phase: args.state.phase as Phase,
    timeLeftSeconds: args.state.phase === "lobby" ? null : Math.ceil(args.state.phaseTimeLeft),
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
      moving: me.vehicleId ? Math.abs([...args.state.vehicles].find((v) => v.id === me.vehicleId)?.speed ?? 0) > 0.3 : me.animation !== "idle",
      vehicle: me.vehicleId || null,
    },
    heist: { alarm: args.state.alarm, vaultOpen: vault.open, vaultProgressPercent: Math.round(vault.progress * 100), bagsLeftInVault: vault.bagsLeft },
    nearbyPlayers: nearby,
    nearbyCars: cars,
    recentSpeech: args.recentSpeech ?? [],
    pendingDeals: (args.deals ?? []).filter((d) => d.status === "pending" || d.status === "accepted"),
    knownLocations: knownLocations(),
    lastActionResult: args.lastActionResult,
    recentEvents: args.recentEvents,
    trust: args.trust ?? {},
    memorySummary: args.memorySummary ?? "",
  };
}

/** Location entrances plus the points inside the bank. Points are passed to move_to as {x, y: 0, z}. */
export function knownLocations(): Record<string, { x: number; z: number }> {
  return {
    ...Object.fromEntries(Object.values(LOCATIONS).map((l) => [l.id, { x: l.entrance.x, z: l.entrance.z }])),
    ...Object.fromEntries(Object.entries(POINTS_OF_INTEREST).map(([k, p]) => [k, { x: p.x, z: p.z }])),
  };
}
