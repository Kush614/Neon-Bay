// Network contract between clients, agents and the server.
import { z } from "zod";
import type { BusinessId, Phase } from "./types.js";

export const ROOM_NAME = "heist";
export const DEFAULT_SERVER_PORT = 2567;
export const MAX_PLAYERS = 8;
/** Speech is heard within this radius (SPEC.md section 15). */
export const HEARING_RADIUS = 30;
/** The in-game ledger panel shows this many rows (SPEC.md section 16). */
export const LEDGER_PANEL_ROWS = 50;

/** Message types. */
export const MSG = {
  /** Client -> server: human movement intent, sent every frame. */
  input: "input",
  /** Server -> client: a message or action was rejected, with the reason. */
  rejected: "rejected",
  /** Client or agent -> server: a discrete Action. */
  action: "action",
  /** Server -> sender: the outcome of an Action. */
  actionResult: "action_result",
  /** Server -> one player: something happened to them (arrived, path failed, ...). */
  event: "event",
  /** Server -> clients: new ledger entries (and the latest 50 on join). */
  ledger: "ledger",
  /** Server -> players in earshot: speech. */
  speech: "speech",
  /** Client -> server: mark this human ready (or not) in the lobby. */
  ready: "ready",
  /** Client -> server: get into the nearest free car, or out of the current one. */
  useVehicle: "use_vehicle",
  /** Server -> the two parties: a deal was created or changed. */
  deal: "deal",
  /** Server -> everyone: something happened to the whole session. */
  world: "world",
} as const;

export const ReadyMessageSchema = z.object({ ready: z.boolean() });
export type ReadyMessage = z.infer<typeof ReadyMessageSchema>;

export interface RejectedMessage {
  /** The message or action type that was rejected. */
  type: string;
  reason: string;
}

/**
 * Movement intent from a human client. Direction is in world space on the ground plane.
 * The server clamps its length to 1, so a client cannot ask for more than run speed.
 */
export const InputMessageSchema = z.object({
  seq: z.number().int().nonnegative(),
  x: z.number().finite().min(-1).max(1),
  z: z.number().finite().min(-1).max(1),
  run: z.boolean(),
  /** In a vehicle: -1 brake/reverse to 1 throttle. */
  throttle: z.number().finite().min(-1).max(1).optional(),
  /** In a vehicle: -1 left to 1 right. */
  steer: z.number().finite().min(-1).max(1).optional(),
});
export type InputMessage = z.infer<typeof InputMessageSchema>;

export const JoinOptionsSchema = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  kind: z.enum(["human", "agent"]).default("human"),
  role: z.enum(["driver", "hacker", "muscle", "fixer", "cop", "human"]).optional(),
  persona: z.enum(["speedrunner", "explorer", "griefer", "newcomer", "none"]).optional(),
});

/** Per-player events pushed by the server. */
export type PlayerEvent =
  | { type: "arrived"; target: string }
  | { type: "path_failed"; target: string; reason: string }
  /** To cops only: a tip-off reveals the crew's positions for this many seconds. */
  | { type: "crew_revealed"; seconds: number; byName: string }
  /** To the cop: an arrest attempt ended without an arrest. */
  | { type: "arrest_failed"; targetName: string; reason: string };

/** Session-wide events broadcast to everyone. */
export type WorldEvent =
  | { type: "phase"; phase: Phase; seconds: number }
  | { type: "alarm"; cause: "vault_opened" | "tip_off" }
  | { type: "vault_opened"; byName: string }
  | { type: "bag_banked"; byName: string; bagsBanked: number }
  | { type: "deals_settled"; count: number }
  | { type: "scores"; scores: { id: string; name: string; score: number }[] }
  | { type: "market_crash"; totalCleanCash: number }
  | { type: "arrest"; targetId: string; targetName: string; byName: string; seconds: number; droppedBag: boolean }
  | { type: "released"; targetId: string; targetName: string }
  | { type: "roadblock"; id: string; byName: string; x: number; z: number; seconds: number }
  | { type: "roadblock_cleared"; id: string }
  | { type: "backup"; byId: string; byName: string; x: number; z: number }
  /** A news bulletin on the in-game radio (NewsFeed adapter). */
  | { type: "radio"; station: string; headline: string; source: string | null };

export type DealStatus = "pending" | "accepted" | "rejected" | "void" | "settled";

/** A deal as its two parties see it. splitPercent is the share of the proposer's take paid to the recipient. */
export interface DealView {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  splitPercent: number;
  note: string;
  status: DealStatus;
  settledAmount: number;
  /** A deal offered to a cop is a bribe, paid at once when the cop accepts it. */
  bribe: boolean;
  /** For a pending bribe: what it is worth now. */
  bribeAmount: number;
}
export type JoinOptions = z.input<typeof JoinOptionsSchema>;

/** Public exchange quote. */
export interface BusinessQuote {
  id: BusinessId;
  label: string;
  price: number;
}

/** Things on the map everyone can see. */
export interface RoadblockView {
  id: string;
  x: number;
  z: number;
  /** Direction the barrier runs, radians. */
  heading: number;
}

export interface DroppedBagView {
  id: string;
  x: number;
  z: number;
}
