// Shared types from SPEC.md section 6. Import these everywhere; never redefine per app.
import type { BusinessId, LocationId } from "./world.js";

export type { BusinessId, LocationId };

export type PlayerId = string;
export type Vec3 = { x: number; y: number; z: number };

export type Phase = "lobby" | "plan" | "prepare" | "heist" | "getaway" | "payout" | "ended";

export type Role = "driver" | "hacker" | "muscle" | "fixer" | "cop" | "human";
export type Persona = "speedrunner" | "explorer" | "griefer" | "newcomer" | "none";

export interface PlayerState {
  id: PlayerId;
  name: string;
  kind: "human" | "agent";
  role: Role;
  persona: Persona;
  position: Vec3;
  heading: number; // radians
  animation: AnimationName;
  vehicleId: string | null;
  dirtyCash: number;
  cleanCash: number;
  carryingBag: boolean;
  arrested: boolean;
  speaking: boolean;
}

export type AnimationName =
  | "idle"
  | "walk"
  | "run"
  | "talk"
  | "argue"
  | "point"
  | "hands_up"
  | "enter_car"
  | "drive"
  | "carry_bag"
  | "celebrate"
  | "fall";

export type Action =
  | { type: "move_to"; target: LocationId | Vec3 }
  | { type: "drive_to"; target: LocationId | Vec3 }
  | { type: "say"; text: string }
  | { type: "whisper"; to: PlayerId; text: string }
  | { type: "propose_deal"; to: PlayerId; terms: DealTerms }
  | { type: "accept"; dealId: string }
  | { type: "reject"; dealId: string }
  | { type: "betray" }
  | { type: "tip_off_police" }
  | { type: "buy_stake"; business: BusinessId; amount: number }
  | { type: "sell_stake"; business: BusinessId; amount: number }
  | { type: "launder" }
  | { type: "grab_bag" }
  | { type: "flee" }
  | { type: "report_issue"; issue: Issue }
  | { type: "wait" }
  // Cop actions (SPEC.md section 11, "Police").
  | { type: "arrest"; target: PlayerId }
  | { type: "set_roadblock" }
  | { type: "accept_bribe"; dealId: string }
  | { type: "call_backup" };

export interface DealTerms {
  splitPercent: number;
  note: string;
}

export interface Issue {
  type: "bug" | "exploit" | "stuck" | "confusing" | "balance";
  severity: "low" | "medium" | "high";
  description: string;
}

export interface LedgerRow {
  sessionId: string;
  tick: number;
  timestamp: string; // ISO 8601
  phase: Phase;
  actorId: PlayerId;
  actorName: string;
  actorKind: "human" | "agent";
  persona: Persona;
  action: Action;
  reason: string; // one sentence; empty for humans
  position: Vec3;
  trustChanges: Record<PlayerId, number>;
  issue: Issue | null;
  harness: string | null;
  latencyMs: number | null;
}
