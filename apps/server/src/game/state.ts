// Server-side game state. Plain data so rules can be unit-tested without rendering or network.
import type { DealStatus, Persona, Phase, Role } from "@neon-bay/shared";

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
  score: number;
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
}

export function createGameState(sessionId: string, bags: number): GameState {
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
  };
}

export function crew(state: GameState): GamePlayer[] {
  return [...state.players.values()].filter((p) => p.role !== "cop");
}
