// Wire state. Mirrors PlayerState from @neon-bay/shared; the server is the only writer.
import { schema, t, type SchemaType } from "@colyseus/schema";

export const Vec3Schema = schema(
  {
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
  },
  "Vec3",
);
export type Vec3Schema = SchemaType<typeof Vec3Schema>;

export const PlayerSchema = schema(
  {
    id: t.string(),
    name: t.string(),
    kind: t.string(),
    role: t.string(),
    persona: t.string(),
    position: t.ref(Vec3Schema),
    heading: t.float32(),
    animation: t.string(),
    /** Empty string means not in a vehicle. */
    vehicleId: t.string(),
    dirtyCash: t.number(),
    cleanCash: t.number(),
    carryingBag: t.boolean(),
    arrested: t.boolean(),
    speaking: t.boolean(),
    /** Last input sequence the server applied, for client reconciliation. */
    lastInputSeq: t.int32(),
  },
  "Player",
);
export type PlayerSchema = SchemaType<typeof PlayerSchema>;

export const HeistStateSchema = schema(
  {
    /** Ledger session id; the report and ledger export are keyed by it. */
    sessionId: t.string(),
    phase: t.string(),
    tick: t.uint32(),
    players: t.map(PlayerSchema),
  },
  "HeistState",
);
export type HeistStateSchema = SchemaType<typeof HeistStateSchema>;
