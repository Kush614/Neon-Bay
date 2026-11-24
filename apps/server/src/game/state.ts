// Server-side game state. Plain data so rules can be unit-tested without rendering or network.
import { BUSINESSES, type BusinessId, type DealStatus, type Persona, type Phase, type Role } from "@neon-bay/shared";

export interface GamePlayer {
  id: string;
  name: string;
  kind: "human" | "agent";
  role: Role;
  persona: Persona;
  ready: boolean;
  dirtyCash: number;
  cleanCash: number;
  carryingBag: boolean;
  arrested: boolean;
  /** Game time the current arrest ends. */
  arrestedUntil: number;
  score: number;
  /** Stake holdings in shares. */
  stakes: Partial<Record<BusinessId, number>>;
  /** True once this player has called tip_off_police (it pays once). */
  tippedOff: boolean;
  /** Cops this player has bribed; they cannot arrest this player. */
  bribed: string[];
  /** Game time of this cop's last call_backup. */
  lastBackupAt: number;
}

export interface ArrestAttempt {
  copId: string;
  targetId: string;
  /** Continuous seconds the target has been within reach and on foot. */
  held: number;
  elapsed: number;
}

export interface DroppedBag {
  id: string;
  x: number;
  z: number;
}

export interface Roadblock {
  id: string;
  copId: string;
  x: number;
  z: number;
  /** Direction the barrier runs across the road, radians. */
  heading: number;
  until: number;
  /** Road edge it blocks, as "a|b" with the ids sorted. */
  edge: string;
}

export interface Exchange {
  /** Price before any crash factor. */
  base: Record<BusinessId, number>;
  /** 1 normally; falls to 0.3 over a crash. */
  factor: number;
  /** Game time the crash started, or null before it. */
  crashedAt: number | null;
}

export interface Deal {
  id: string;
  fromId: string;
  toId: string;
  /** Share of the proposer's dirty cash at payout that goes to the recipient. */
  splitPercent: number;
  note: string;
  status: DealStatus;
  createdTick: number;
  /** Amount moved at settlement. */
  settledAmount: number;
}

export interface GameState {
  sessionId: string;
  tick: number;
  /** Seconds since the session started. */
  time: number;
  phase: Phase;
  phaseTimeLeft: number;
  /** Game time each phase started, for the report's completion times. */
  phaseStartedAt: Partial<Record<Phase, number>>;
  players: Map<string, GamePlayer>;
  vault: { progress: number; open: boolean; bagsLeft: number };
  alarm: boolean;
  deals: Map<string, Deal>;
  bagsBanked: number;
  nextDealNumber: number;
  /** Planted exploit switch (SPEC.md section 11). Do not remove. */
  exploitEnabled: boolean;
  exchange: Exchange;
  arrests: Map<string, ArrestAttempt>;
  droppedBags: DroppedBag[];
  roadblocks: Map<string, Roadblock>;
  /** Game time until which the crew's positions are revealed to cops. */
  revealUntil: number;
  nextId: number;
}

export function createGameState(sessionId: string, bags: number, exploitEnabled = false): GameState {
  return {
    sessionId,
    tick: 0,
    time: 0,
    phase: "lobby",
    phaseTimeLeft: 0,
    phaseStartedAt: { lobby: 0 },
    players: new Map(),
    vault: { progress: 0, open: false, bagsLeft: bags },
    alarm: false,
    deals: new Map(),
    bagsBanked: 0,
    nextDealNumber: 1,
    exploitEnabled,
    exchange: {
      base: Object.fromEntries(Object.values(BUSINESSES).map((b) => [b.id, b.startPrice])) as Record<BusinessId, number>,
      factor: 1,
      crashedAt: null,
    },
    arrests: new Map(),
    droppedBags: [],
    roadblocks: new Map(),
    revealUntil: 0,
    nextId: 1,
  };
}

export function crew(state: GameState): GamePlayer[] {
  return [...state.players.values()].filter((p) => p.role !== "cop");
}

/** A fresh player record with the defaults every rule expects. */
export function newPlayer(p: Pick<GamePlayer, "id" | "name" | "kind" | "role" | "persona"> & Partial<GamePlayer>): GamePlayer {
  return {
    ready: false,
    dirtyCash: 0,
    cleanCash: 0,
    carryingBag: false,
    arrested: false,
    arrestedUntil: 0,
    score: 0,
    stakes: {},
    tippedOff: false,
    bribed: [],
    lastBackupAt: -Infinity,
    ...p,
  };
}
