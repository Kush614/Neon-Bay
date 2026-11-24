// Police, arrests, bribes and tip-offs (SPEC.md section 11, "Police" and "Deals and betrayal").
import {
  ARREST_ATTEMPT_SECONDS,
  ARREST_BREAK_RADIUS,
  ARREST_OUT_SECONDS,
  ARREST_RADIUS,
  ARREST_SECONDS,
  ARREST_START_RADIUS,
  BACKUP_COOLDOWN_SECONDS,
  ROADBLOCK_ROAD_RADIUS,
  ROADBLOCK_SECONDS,
  TIP_OFF_REVEAL_SECONDS,
  TIP_OFF_REWARD,
  type Phase,
} from "@neon-bay/shared";
import type { ArrestAttempt, Deal, GamePlayer, GameState, Roadblock } from "../game/state.js";
import { nearestRoadEdge } from "../sim/vehicles.js";

type XZ = { x: number; z: number };
type Result = { ok: boolean; reason: string };

const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);
const money = (n: number) => Math.round(n).toLocaleString("en-US");

const ACTIVE_PHASES: Phase[] = ["plan", "prepare", "heist", "getaway"];

// ---- tip-offs ----------------------------------------------------------------

/** Reveal the crew to the cops for 30 s, pay the caller 20,000 clean, and sound the alarm. Pays once per player. */
export function tipOff(state: GameState, p: GamePlayer): Result & { alarmRaised: boolean } {
  const no = (reason: string) => ({ ok: false, reason, alarmRaised: false });
  if (!ACTIVE_PHASES.includes(state.phase)) return no(`there is nothing to tip off during ${state.phase}`);
  if (p.role === "cop") return no("cops cannot tip themselves off");
  if (p.tippedOff) return no("you already tipped off the police; they will not pay twice");
  p.tippedOff = true;
  p.cleanCash += TIP_OFF_REWARD;
  state.revealUntil = state.time + TIP_OFF_REVEAL_SECONDS;
  const alarmRaised = !state.alarm;
  state.alarm = true;
  return { ok: true, reason: `the police paid ${money(TIP_OFF_REWARD)} for the tip; the crew is exposed for ${TIP_OFF_REVEAL_SECONDS} s`, alarmRaised };
}

// ---- arrests -----------------------------------------------------------------

export interface Positions {
  pos(id: string): XZ | null;
  onFoot(id: string): boolean;
}

/** A cop starts arresting a crew member within ARREST_START_RADIUS. The arrest lands after 3 s within 2 m. */
export function startArrest(state: GameState, cop: GamePlayer, targetId: string, w: Positions): Result {
  if (cop.role !== "cop") return { ok: false, reason: "only cops can arrest" };
  const target = state.players.get(targetId);
  if (!target) return { ok: false, reason: `no player with id ${targetId}` };
  if (target.role === "cop") return { ok: false, reason: "you cannot arrest another cop" };
  if (target.arrested) return { ok: false, reason: `${target.name} is already arrested` };
  if (!state.alarm) return { ok: false, reason: "no crime has been reported yet; arrests start once the alarm sounds" };
  if (target.bribed.includes(cop.id)) return { ok: false, reason: `you took ${target.name}'s money; you will not arrest them` };
  if (!w.onFoot(cop.id)) return { ok: false, reason: "get out of the car to make an arrest" };
  const a = w.pos(cop.id);
  const b = w.pos(targetId);
  if (!a || !b) return { ok: false, reason: "player is not in the world" };
  const d = dist(a, b);
  if (d > ARREST_START_RADIUS) return { ok: false, reason: `${target.name} is ${d.toFixed(0)} m away; get within ${ARREST_START_RADIUS} m` };
  state.arrests.set(cop.id, { copId: cop.id, targetId, held: 0, elapsed: 0 });
  return { ok: true, reason: `arresting ${target.name}: stay within ${ARREST_RADIUS} m of them on foot for ${ARREST_SECONDS} s` };
}

export interface ArrestOutcome {
  arrested: { attempt: ArrestAttempt; droppedBag: { x: number; z: number } | null }[];
  failed: { attempt: ArrestAttempt; reason: string }[];
}

/** Advance arrest attempts and release players whose 30 s are up. */
export function policeTick(state: GameState, w: Positions, dt: number): ArrestOutcome & { released: GamePlayer[]; clearedRoadblocks: Roadblock[] } {
  const out: ArrestOutcome & { released: GamePlayer[]; clearedRoadblocks: Roadblock[] } = { arrested: [], failed: [], released: [], clearedRoadblocks: [] };
  for (const a of [...state.arrests.values()]) {
    const cop = state.players.get(a.copId);
    const target = state.players.get(a.targetId);
    const fail = (reason: string) => {
      state.arrests.delete(a.copId);
      out.failed.push({ attempt: a, reason });
    };
    if (!cop || !target) {
      fail("the target left");
      continue;
    }
    if (target.arrested) {
      fail(`${target.name} was already arrested`);
      continue;
    }
    if (target.bribed.includes(cop.id)) {
      fail(`${target.name} paid you off`);
      continue;
    }
    const cp = w.pos(cop.id);
    const tp = w.pos(target.id);
    if (!cp || !tp) {
      fail("lost sight of the target");
      continue;
    }
    a.elapsed += dt;
    const d = dist(cp, tp);
    if (d > ARREST_BREAK_RADIUS) {
      fail(`${target.name} got away (${d.toFixed(0)} m)`);
      continue;
    }
    if (d <= ARREST_RADIUS && w.onFoot(target.id) && w.onFoot(cop.id)) a.held += dt;
    else a.held = 0;
    if (a.held >= ARREST_SECONDS) {
      state.arrests.delete(a.copId);
      out.arrested.push({ attempt: a, droppedBag: arrest(state, target, tp) });
      continue;
    }
    if (a.elapsed >= ARREST_ATTEMPT_SECONDS) fail(`could not hold ${target.name} for ${ARREST_SECONDS} s`);
  }
  for (const p of state.players.values()) {
    if (p.arrested && state.time >= p.arrestedUntil) {
      p.arrested = false;
      out.released.push(p);
    }
  }
  for (const rb of [...state.roadblocks.values()]) {
    if (state.time >= rb.until) {
      state.roadblocks.delete(rb.id);
      out.clearedRoadblocks.push(rb);
    }
  }
  return out;
}

/** The arrested player drops their bag where they stand and is out for 30 s. */
export function arrest(state: GameState, p: GamePlayer, at: XZ): { x: number; z: number } | null {
  p.arrested = true;
  p.arrestedUntil = state.time + ARREST_OUT_SECONDS;
  for (const [copId, a] of state.arrests) if (a.targetId === p.id) state.arrests.delete(copId);
  if (!p.carryingBag) return null;
  p.carryingBag = false;
  state.droppedBags.push({ id: `bag_${state.nextId++}`, x: at.x, z: at.z });
  return { x: at.x, z: at.z };
}

// ---- bribes ------------------------------------------------------------------

/** What a bribe offered as a deal is worth: splitPercent of the briber's cash, clean first. */
export function bribeAmount(state: GameState, d: Deal): number {
  const from = state.players.get(d.fromId);
  if (!from) return 0;
  return Math.floor(((from.cleanCash + from.dirtyCash) * d.splitPercent) / 100);
}

export function isBribe(state: GameState, d: Deal): boolean {
  return state.players.get(d.toId)?.role === "cop";
}

/**
 * A cop takes a bribe that was offered as a deal. The money moves at once, clean cash first,
 * and in kind (dirty stays dirty). The cop can no longer arrest the briber.
 */
export function acceptBribe(state: GameState, cop: GamePlayer, dealId: string): Result & { deal?: Deal } {
  if (cop.role !== "cop") return { ok: false, reason: "only cops take bribes" };
  const d = state.deals.get(dealId);
  if (!d) return { ok: false, reason: `no deal ${dealId}` };
  if (d.toId !== cop.id) return { ok: false, reason: "that offer was not made to you" };
  if (d.status !== "pending") return { ok: false, reason: `${dealId} is already ${d.status}` };
  const from = state.players.get(d.fromId);
  if (!from) return { ok: false, reason: "the briber left" };
  const amount = bribeAmount(state, d);
  if (amount <= 0) return { ok: false, reason: `${from.name} has nothing to pay` };
  const clean = Math.min(amount, from.cleanCash);
  const dirty = amount - clean;
  from.cleanCash -= clean;
  from.dirtyCash -= dirty;
  cop.cleanCash += clean;
  cop.dirtyCash += dirty;
  d.status = "settled";
  d.settledAmount = amount;
  if (!from.bribed.includes(cop.id)) from.bribed.push(cop.id);
  return { ok: true, reason: `took ${money(amount)} from ${from.name}`, deal: d };
}

// ---- roadblocks and backup -----------------------------------------------------

export function setRoadblock(state: GameState, cop: GamePlayer, at: XZ): Result & { roadblock?: Roadblock } {
  if (cop.role !== "cop") return { ok: false, reason: "only cops can set roadblocks" };
  if (!ACTIVE_PHASES.includes(state.phase)) return { ok: false, reason: `no roadblocks during ${state.phase}` };
  for (const rb of state.roadblocks.values()) if (rb.copId === cop.id) return { ok: false, reason: `your roadblock ${rb.id} is still up` };
  const road = nearestRoadEdge(at);
  if (road.distance > ROADBLOCK_ROAD_RADIUS) return { ok: false, reason: `stand on a road to set a roadblock (nearest is ${road.distance.toFixed(0)} m away)` };
  const rb: Roadblock = {
    id: `roadblock_${state.nextId++}`,
    copId: cop.id,
    x: road.x,
    z: road.z,
    heading: road.heading + Math.PI / 2,
    until: state.time + ROADBLOCK_SECONDS,
    edge: road.edge,
  };
  state.roadblocks.set(rb.id, rb);
  return { ok: true, reason: `roadblock up for ${ROADBLOCK_SECONDS} s`, roadblock: rb };
}

export function callBackup(state: GameState, cop: GamePlayer): Result {
  if (cop.role !== "cop") return { ok: false, reason: "only cops can call backup" };
  const wait = cop.lastBackupAt + BACKUP_COOLDOWN_SECONDS - state.time;
  if (wait > 0) return { ok: false, reason: `backup was called ${(BACKUP_COOLDOWN_SECONDS - wait).toFixed(0)} s ago; wait ${wait.toFixed(0)} s` };
  cop.lastBackupAt = state.time;
  return { ok: true, reason: "backup called; every cop has your position" };
}
