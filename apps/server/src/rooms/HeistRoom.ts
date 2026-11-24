import RAPIER from "@dimforge/rapier3d-compat";
import { Room, type Client, type StepContext } from "colyseus";
import {
  ActionSchema,
  InputMessageSchema,
  JoinOptionsSchema,
  MSG,
  MAX_PLAYERS,
  PATCH_RATE_HZ,
  spawnPoint,
  TICK_RATE_HZ,
  type AnimationName,
  type ActionResult,
  type Phase,
  type RejectedMessage,
} from "@neon-bay/shared";
import { HeistStateSchema, PlayerSchema, Vec3Schema } from "../schema.js";
import { NavGraph } from "../sim/navmesh.js";
import { Simulation } from "../sim/Simulation.js";
import { applyAction } from "./actions.js";

/** Physics sub-steps per 20 Hz tick, so the server integrates at the client's 60 Hz. */
const SUB_STEPS = 3;

let rapierReady: Promise<void> | null = null;
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

// The navmesh depends only on static world data, so every room shares one.
let navReady: Promise<NavGraph> | null = null;
function sharedNavGraph(): Promise<NavGraph> {
  navReady ??= NavGraph.build();
  return navReady;
}

export class HeistRoom extends Room<{ state: HeistStateSchema }> {
  override maxClients = MAX_PLAYERS;
  override patchRate = 1000 / PATCH_RATE_HZ;
  override maxMessagesPerSecond = 120;
  override state = new HeistStateSchema();
  private sim!: Simulation;
  private nav!: NavGraph;
  private nextSpawn = 0;
  private humanCount = 0;

  override messages = {
    // Invalid input is rejected with a reason instead of disconnecting the sender.
    [MSG.input]: (client: Client, raw: unknown) => {
      const parsed = InputMessageSchema.safeParse(raw);
      if (!parsed.success) {
        this.reject(client, MSG.input, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        return;
      }
      this.sim.setInput(client.sessionId, parsed.data);
    },
    [MSG.action]: (client: Client, raw: unknown) => {
      const parsed = ActionSchema.safeParse(raw);
      if (!parsed.success) {
        const reason = parsed.error.issues.map((i) => `${i.path.join(".") || "action"}: ${i.message}`).join("; ");
        client.send(MSG.actionResult, { action: (raw as { type?: string })?.type ?? "unknown", ok: false, reason } as ActionResult);
        return;
      }
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const res = applyAction(
        { sim: this.sim, nav: this.nav, phase: this.state.phase as Phase, playerId: client.sessionId, arrested: player.arrested },
        parsed.data,
      );
      client.send(MSG.actionResult, res satisfies ActionResult);
    },
  };

  private reject(client: Client, type: string, reason: string) {
    client.send(MSG.rejected, { type, reason } satisfies RejectedMessage);
  }

  override async onCreate() {
    await initRapier();
    this.nav = await sharedNavGraph();
    this.sim = new Simulation(RAPIER);
    this.state.phase = "lobby" satisfies Phase;
    this.state.tick = 0;
    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE_HZ, { subSteps: SUB_STEPS });
  }

  override onJoin(client: Client, rawOptions: unknown) {
    const options = JoinOptionsSchema.parse(rawOptions ?? {});
    const spawn = spawnPoint("nightclub", this.nextSpawn++ % MAX_PLAYERS);
    this.sim.addPlayer(client.sessionId, spawn);
    if (options.kind === "human") this.humanCount++;

    const p = new PlayerSchema();
    p.id = client.sessionId;
    p.name = options.name ?? (options.kind === "human" ? `Player ${this.humanCount}` : "Agent");
    p.kind = options.kind;
    p.role = options.role ?? (options.kind === "human" ? "human" : "fixer");
    p.persona = options.persona ?? "none";
    p.position = new Vec3Schema();
    p.heading = 0;
    p.animation = "idle" satisfies AnimationName;
    p.vehicleId = "";
    p.dirtyCash = 0;
    p.cleanCash = 0;
    p.carryingBag = false;
    p.arrested = false;
    p.speaking = false;
    p.lastInputSeq = -1;
    this.writePlayer(p);
    this.state.players.set(client.sessionId, p);
  }

  override onLeave(client: Client) {
    this.sim.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    this.sim?.dispose();
  }

  private step(ctx: StepContext) {
    for (let i = 0; i < ctx.subSteps; i++) this.sim.step(ctx.subDt);
    this.state.tick = ctx.tick;
    for (const p of this.state.players.values()) this.writePlayer(p);
    for (const { id, event } of this.sim.drainEvents()) this.clients.get(id)?.send(MSG.event, event);
  }

  private writePlayer(p: PlayerSchema) {
    const s = this.sim.snapshot(p.id);
    if (!s) return;
    p.position.x = s.position.x;
    p.position.y = s.position.y;
    p.position.z = s.position.z;
    p.heading = s.heading;
    p.lastInputSeq = s.lastSeq;
    p.animation = (s.running ? "run" : s.moving ? "walk" : "idle") satisfies AnimationName;
  }
}
