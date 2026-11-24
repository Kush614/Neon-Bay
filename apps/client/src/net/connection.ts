import { Client, type Room } from "@colyseus/sdk";
import {
  DEFAULT_SERVER_PORT,
  MSG,
  ROOM_NAME,
  type InputMessage,
  type JoinOptions,
  type LedgerEntry,
  type RejectedMessage,
  type SpeechMessage,
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
  lastInputSeq: number;
}

interface WireState {
  sessionId: string;
  phase: string;
  tick: number;
  players: Map<string, WirePlayer>;
}

export interface RosterEntry {
  id: string;
  name: string;
  kind: string;
  role: string;
  isLocal: boolean;
}

type Status = "connecting" | "connected" | "offline";

interface NetStore {
  status: Status;
  sessionId: string | null;
  phase: string;
  roster: RosterEntry[];
  lastRejection: RejectedMessage | null;
  ledgerSessionId: string | null;
  ledger: LedgerEntry[];
  speech: (SpeechMessage & { at: number })[];
}

const LEDGER_KEEP = 200;

export const useNetStore = create<NetStore>(() => ({
  status: "connecting",
  sessionId: null,
  phase: "lobby",
  roster: [],
  lastRejection: null,
  ledgerSessionId: null,
  ledger: [],
  speech: [],
}));

/** Per-frame data kept outside React. */
export const remoteBuffers = new Map<string, SnapshotBuffer>();
export const localServerState: { player: WirePlayer | null; receivedAt: number } = { player: null, receivedAt: 0 };

let room: Room<any, WireState> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  return env ?? `${location.protocol}//${location.hostname}:${DEFAULT_SERVER_PORT}`;
}

function onState(state: WireState) {
  const now = performance.now();
  const sessionId = useNetStore.getState().sessionId;
  const roster: RosterEntry[] = [];
  const seen = new Set<string>();
  for (const p of state.players.values()) {
    seen.add(p.id);
    roster.push({ id: p.id, name: p.name, kind: p.kind, role: p.role, isLocal: p.id === sessionId });
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

  const prev = useNetStore.getState();
  const rosterChanged =
    prev.roster.length !== roster.length || prev.roster.some((r, i) => r.id !== roster[i]?.id || r.name !== roster[i]?.name);
  if (rosterChanged || prev.phase !== state.phase || prev.ledgerSessionId !== state.sessionId) {
    useNetStore.setState({ roster, phase: state.phase, ledgerSessionId: state.sessionId });
  }
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
      });
      r.onMessage(MSG.ledger, (entries: LedgerEntry[]) => {
        useNetStore.setState((s) => ({ ledger: [...s.ledger, ...entries].slice(-LEDGER_KEEP) }));
      });
      r.onMessage(MSG.speech, (m: SpeechMessage) => {
        useNetStore.setState((s) => ({ speech: [...s.speech, { ...m, at: Date.now() }].slice(-20) }));
      });
      r.onMessage(MSG.actionResult, () => {});
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
