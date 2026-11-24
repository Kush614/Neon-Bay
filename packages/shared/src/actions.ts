// Runtime validation for the Action union in types.ts. The server validates every action with
// these, and agents validate model output with them.
import { z } from "zod";
import type { Action, Issue, LedgerRow } from "./types.js";
import { BUSINESSES, LOCATION_IDS, type BusinessId, type LocationId } from "./world.js";

export const LocationIdSchema = z.enum(LOCATION_IDS as [LocationId, ...LocationId[]]);
export const BusinessIdSchema = z.enum(Object.keys(BUSINESSES) as [BusinessId, ...BusinessId[]]);
export const Vec3Schema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const TargetSchema = z.union([LocationIdSchema, Vec3Schema]);
const Text = z.string().trim().min(1).max(280);

export const IssueSchema = z.object({
  type: z.enum(["bug", "exploit", "stuck", "confusing", "balance"]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string().trim().min(1).max(500),
}) satisfies z.ZodType<Issue>;

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_to"), target: TargetSchema }),
  z.object({ type: z.literal("drive_to"), target: TargetSchema }),
  z.object({ type: z.literal("say"), text: Text }),
  z.object({ type: z.literal("whisper"), to: z.string().min(1), text: Text }),
  z.object({
    type: z.literal("propose_deal"),
    to: z.string().min(1),
    terms: z.object({ splitPercent: z.number().min(0).max(100), note: z.string().max(280) }),
  }),
  z.object({ type: z.literal("accept"), dealId: z.string().min(1) }),
  z.object({ type: z.literal("reject"), dealId: z.string().min(1) }),
  z.object({ type: z.literal("betray") }),
  z.object({ type: z.literal("tip_off_police") }),
  z.object({ type: z.literal("buy_stake"), business: BusinessIdSchema, amount: z.number().positive().finite() }),
  z.object({ type: z.literal("sell_stake"), business: BusinessIdSchema, amount: z.number().positive().finite() }),
  z.object({ type: z.literal("launder") }),
  z.object({ type: z.literal("grab_bag") }),
  z.object({ type: z.literal("flee") }),
  z.object({ type: z.literal("report_issue"), issue: IssueSchema }),
  z.object({ type: z.literal("wait") }),
]) satisfies z.ZodType<Action>;

// Compile-time check that the schema covers exactly the Action union.
type _SchemaMatchesAction = [z.infer<typeof ActionSchema>] extends [Action] ? ([Action] extends [z.infer<typeof ActionSchema>] ? true : never) : never;
const _check: _SchemaMatchesAction = true;
void _check;

export type ActionType = Action["type"];

/** Server -> sender result of an action. */
export interface ActionResult {
  /** The action's type, or "invalid" when the message was not a valid Action. */
  action: ActionType | "invalid";
  ok: boolean;
  /** Why it was rejected, or a short note on success. */
  reason: string;
}

/** The JSON reply agents require from the model (SPEC.md section 12). */
export const DecisionSchema = z.object({
  action: ActionSchema,
  reason: z.string().trim().min(1).max(300),
  say: z.string().trim().min(1).max(280).nullable(),
  trustChanges: z.record(z.string(), z.number().finite()).default({}),
});
export type Decision = z.infer<typeof DecisionSchema>;

/**
 * What a sender attaches to an action so the server can write the ledger row.
 * Agents fill every field; humans send no metadata and get an empty reason.
 */
export const ActionMetaSchema = z.object({
  reason: z.string().max(300).default(""),
  trustChanges: z.record(z.string(), z.number().finite()).default({}),
  harness: z.string().max(80).nullable().default(null),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
  /** True when the decision cites a memory from a past session (SPEC.md section 14). */
  citesPastSession: z.boolean().default(false),
});
export type ActionMeta = z.infer<typeof ActionMetaSchema>;

/** Wire format of an action message: the Action plus optional decision metadata. */
export const ActionEnvelopeSchema = z.object({
  action: ActionSchema,
  meta: ActionMetaSchema.optional(),
});
export type ActionEnvelope = z.input<typeof ActionEnvelopeSchema>;

const PhaseSchema = z.enum(["lobby", "plan", "prepare", "heist", "getaway", "payout", "ended"]);
const PersonaSchema = z.enum(["speedrunner", "explorer", "griefer", "newcomer", "none"]);

/** Runtime check for LedgerRow, used by tests, export and the report. */
export const LedgerRowSchema = z.object({
  sessionId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
  phase: PhaseSchema,
  actorId: z.string().min(1),
  actorName: z.string().min(1),
  actorKind: z.enum(["human", "agent"]),
  persona: PersonaSchema,
  action: ActionSchema,
  reason: z.string(),
  position: Vec3Schema,
  trustChanges: z.record(z.string(), z.number()),
  issue: IssueSchema.nullable(),
  harness: z.string().nullable(),
  latencyMs: z.number().nullable(),
}) satisfies z.ZodType<LedgerRow>;

/** A ledger row as broadcast to clients: the row plus the outcome and the past-session flag. */
export interface LedgerEntry {
  row: LedgerRow;
  ok: boolean;
  result: string;
  citesPastSession: boolean;
}

/** Speech delivered to players in earshot (or to one player, for a whisper). */
export interface SpeechMessage {
  fromId: string;
  fromName: string;
  text: string;
  whisper: boolean;
  toId: string | null;
}
