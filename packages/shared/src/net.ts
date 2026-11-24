// Network contract between clients, agents and the server.
import { z } from "zod";

export const ROOM_NAME = "heist";
export const DEFAULT_SERVER_PORT = 2567;
export const MAX_PLAYERS = 8;

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
} as const;

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
  | { type: "path_failed"; target: string; reason: string };
export type JoinOptions = z.input<typeof JoinOptionsSchema>;
