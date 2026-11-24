import { Client, type Room } from "@colyseus/sdk";
import {
  DEFAULT_SERVER_PORT,
  MSG,
  ROOM_NAME,
  type Action,
  type ActionResult,
  type DealView,
  type InputMessage,
  type JoinOptions,
  type LedgerEntry,
  type RejectedMessage,
  type SpeechMessage,
  type WorldEvent,
} from "@neon-bay/shared";
import { create } from "zustand";
import { SnapshotBuffer } from "./interpolation.js";

/** Shape of a player as decoded from the server's wire state. */
export interface WirePlayer {
  id: string;
  name: string;
  kind: string;
  role: string;
  persona: string;
  position: { x: number; y: number; z: number };
  heading: number;
  animation: string;
  vehicleId: string;
  dirtyCash: number;
  cleanCash: number;
  carryingBag: boolean;
  arrested: boolean;
  ready: boolean;
  score: number;
  lastInputSeq: number;
}

export interface WireVehicle {
  id: string;
  label: string;
  color: string;
  position: { x: number; y: number; z: number };
  heading: number;
  speed: number;
  driverId: string;
}

interface WireState {
  sessionId: string;
  phase: string;
  phaseTimeLeft: number;
  tick: number;
  alarm: boolean;
  vaultProgress: number;
  vaultOpen: boolean;
  bagsLeft: number;
  bagsBanked: number;
  players: Map<string, WirePlayer>;
  vehicles: Map<string, WireVehicle>;
}

export interface RosterEntry {
  id: string;
  name: string;
  kind: string;
  role: string;
  isLocal: boolean;
  inVehicle: boolean;
  carryingBag: boolean;
  ready: boolean;
  dirtyCash: number;
  cleanCash: number;
  score: number;
}

export interface VehicleEntry {
  id: string;
  label: string;
  color: string;
  driverId: string;
}

export interface GameInfo {
  phase: string;
  /** Whole seconds left in the phase. */
  timeLeft: number;
  alarm: boolean;
  vaultPercent: number;
  vaultOpen: boolean;
  bagsLeft: number;
  bagsBanked: number;
}

type Status = "connecting" | "connected" | "offline";

interface NetStore {
  status: Status;
  sessionId: string | null;
  phase: string;
  game: GameInfo;
  roster: RosterEntry[];
  vehicles: VehicleEntry[];
  deals: DealView[];
  feed: { text: string; at: number }[];
  lastRejection: RejectedMessage | null;
  lastResult: ActionResult | null;
  ledgerSessionId: string | null;
  ledger: LedgerEntry[];
  speech: (SpeechMessage & { at: number })[];
}

const LEDGER_KEEP = 200;

export const useNetStore = create<NetStore>(() => ({
  status: "connecting",
  sessionId: null,
  phase: "lobby",
  game: { phase: "lobby", timeLeft: 0, alarm: false, vaultPercent: 0, vaultOpen: false, bagsLeft: 4, bagsBanked: 0 },
  roster: [],
  vehicles: [],
  deals: [],
  feed: [],
  lastRejection: null,
  lastResult: null,
  ledgerSessionId: null,
  ledger: [],
  speech: [],
}));

/** Per-frame data kept outside React. */
export const remoteBuffers = new Map<string, SnapshotBuffer>();
export const vehicleBuffers = new Map<string, SnapshotBuffer>();
export const localServerState: { player: WirePlayer | null; receivedAt: number } = { player: null, receivedAt: 0 };

let room: Room<any, WireState> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  return env ?? `${location.protocol}//${location.hostname}:${DEFAULT_SERVER_PORT}`;
}

const shallowEqual = <T extends object>(a: T[], b: T[]) =>
  a.length === b.length && a.every((x, i) => Object.keys(x).every((k) => x[k as keyof T] === b[i]![k as keyof T]));

function onState(state: WireState) {
  const now = performance.now();
  const sessionId = useNetStore.getState().sessionId;
  const roster: RosterEntry[] = [];
  const seen = new Set<string>();
  for (const p of state.players.values()) {
    seen.add(p.id);
    roster.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      role: p.role,
      isLocal: p.id === sessionId,
      inVehicle: !!p.vehicleId,
      carryingBag: p.carryingBag,
      ready: p.ready,
      dirtyCash: p.dirtyCash,
      cleanCash: p.cleanCash,
      score: p.score,
    });
    if (p.id === sessionId) {
      localServerState.player = { ...p, position: { ...p.position } };
      localServerState.receivedAt = now;
      continue;
    }
    let buf = remoteBuffers.get(p.id);
    if (!buf) remoteBuffers.set(p.id, (buf = new SnapshotBuffer()));
    buf.push({ t: now, x: p.position.x, y: p.position.y, z: p.position.z, heading: p.heading });
  }
  for (const id of remoteBuffers.keys()) if (!seen.has(id)) remoteBuffers.delete(id);

  const vehicles: VehicleEntry[] = [];
  for (const v of state.vehicles?.values() ?? []) {
    vehicles.push({ id: v.id, label: v.label, color: v.color, driverId: v.driverId });
    let buf = vehicleBuffers.get(v.id);
    if (!buf) vehicleBuffers.set(v.id, (buf = new SnapshotBuffer()));
    buf.push({ t: now, x: v.position.x, y: v.position.y, z: v.position.z, heading: v.heading });
  }

  const game: GameInfo = {
    phase: state.phase,
    timeLeft: Math.ceil(state.phaseTimeLeft ?? 0),
    alarm: !!state.alarm,
    vaultPercent: Math.round((state.vaultProgress ?? 0) * 100),
    vaultOpen: !!state.vaultOpen,
    bagsLeft: state.bagsLeft ?? 0,
    bagsBanked: state.bagsBanked ?? 0,
  };
  const prev = useNetStore.getState();
  const patch: Partial<NetStore> = {};
  if (!shallowEqual(prev.roster, roster)) patch.roster = roster;
  if (!shallowEqual(prev.vehicles, vehicles)) patch.vehicles = vehicles;
  if (!shallowEqual([prev.game], [game])) patch.game = game;
  if (prev.phase !== state.phase) patch.phase = state.phase;
  if (prev.ledgerSessionId !== state.sessionId) patch.ledgerSessionId = state.sessionId;
  if (Object.keys(patch).length) useNetStore.setState(patch);
}

function describeWorld(e: WorldEvent): string {
  switch (e.type) {
    case "phase":
      return `Phase: ${e.phase.toUpperCase()}`;
    case "alarm":
      return e.cause === "vault_opened" ? "ALARM! The vault is open." : "ALARM! Someone tipped off the police.";
    case "vault_opened":
      return `${e.byName} cracked the vault.`;
    case "bag_banked":
      return `${e.byName} banked a bag at the marina (${e.bagsBanked}).`;
    case "deals_settled":
      return `${e.count} deal(s) settled.`;
    case "scores":
      return `Final: ${e.scores.map((s) => `${s.name} ${s.score.toLocaleString()}`).join(" · ")}`;
    case "radio":
      return `📻 ${e.station}: ${e.headline}`;
    default:
      return "";
  }
}

function pushFeed(text: string) {
  useNetStore.setState((s) => ({ feed: [...s.feed, { text, at: Date.now() }].slice(-8) }));
}

let connecting: Promise<void> | null = null;

export function connect(): Promise<void> {
  connecting ??= (async () => {
    const params = new URLSearchParams(location.search);
    const options: JoinOptions = { kind: "human" };
    const name = params.get("name");
    if (name) options.name = name;
    try {
      const client = new Client(serverUrl());
      const r = await client.joinOrCreate<WireState>(ROOM_NAME, options);
      room = r;
      useNetStore.setState({ status: "connected", sessionId: r.sessionId });
      r.onStateChange(onState);
      r.onMessage(MSG.rejected, (m: RejectedMessage) => {
        console.warn(`[net] ${m.type} rejected: ${m.reason}`);
        useNetStore.setState({ lastRejection: m });
        if (m.type !== MSG.input) pushFeed(m.reason);
      });
      r.onMessage(MSG.ledger, (entries: LedgerEntry[]) => {
        useNetStore.setState((s) => ({ ledger: [...s.ledger, ...entries].slice(-LEDGER_KEEP) }));
      });
      r.onMessage(MSG.speech, (m: SpeechMessage) => {
        useNetStore.setState((s) => ({ speech: [...s.speech, { ...m, at: Date.now() }].slice(-20) }));
        pushFeed(`${m.fromName}${m.whisper ? " (whisper)" : ""}: ${m.text}`);
      });
      r.onMessage(MSG.actionResult, (res: ActionResult) => {
        useNetStore.setState({ lastResult: res });
        pushFeed(`${res.action}: ${res.reason}`);
      });
      r.onMessage(MSG.deal, (d: DealView) => {
        useNetStore.setState((s) => ({ deals: [...s.deals.filter((x) => x.id !== d.id), d] }));
        if (d.toId === r.sessionId && d.status === "pending") pushFeed(`${d.fromName} offers you ${d.splitPercent}% of their take: "${d.note}" (Y accept / N reject)`);
      });
      r.onMessage(MSG.world, (e: WorldEvent) => {
        const text = describeWorld(e);
        if (text) pushFeed(text);
      });
      r.onMessage(MSG.event, () => {});
      r.onLeave(() => {
        room = null;
        useNetStore.setState({ status: "offline" });
      });
    } catch (err) {
      console.warn("[net] could not reach the game server; running offline", err);
      useNetStore.setState({ status: "offline" });
    }
  })();
  return connecting;
}

export function sendInput(input: InputMessage): void {
  room?.send(MSG.input, input);
}

export function sendAction(action: Action): void {
  room?.send(MSG.action, { action });
}

export function sendReady(ready: boolean): void {
  room?.send(MSG.ready, { ready });
}

export function sendUseVehicle(): void {
  room?.send(MSG.useVehicle, {});
}

// Test and debug hook: lets the e2e smoke test read what this client sees.
declare global {
  interface Window {
    __neonBay?: { sessionId: () => string | null; players: () => { id: string; name: string; x: number; z: number; local: boolean }[] };
  }
}
window.__neonBay = {
  sessionId: () => useNetStore.getState().sessionId,
  players: () => {
    const out: { id: string; name: string; x: number; z: number; local: boolean }[] = [];
    for (const r of useNetStore.getState().roster) {
      const s = r.isLocal ? localServerState.player?.position : remoteBuffers.get(r.id)?.latest();
      if (s) out.push({ id: r.id, name: r.name, x: s.x, z: s.z, local: r.isLocal });
    }
    return out;
  },
};
