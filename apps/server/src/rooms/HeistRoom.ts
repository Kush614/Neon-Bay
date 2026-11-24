import RAPIER from "@dimforge/rapier3d-compat";
import { Room, type Client, type StepContext } from "colyseus";
import {
  ActionEnvelopeSchema,
  HEARING_RADIUS,
  InputMessageSchema,
  LEDGER_PANEL_ROWS,
  JoinOptionsSchema,
  MSG,
  MAX_PLAYERS,
  PATCH_RATE_HZ,
  spawnPoint,
  TICK_RATE_HZ,
  type AnimationName,
  type Action,
  type ActionMeta,
  type ActionResult,
  type LedgerEntry,
  type Persona,
  type Phase,
  type RejectedMessage,
  type SpeechMessage,
} from "@neon-bay/shared";
import { LedgerWriter } from "../ledger/LedgerWriter.js";
import { HeistStateSchema, PlayerSchema, Vec3Schema } from "../schema.js";
import { NavGraph } from "../sim/navmesh.js";
import { Simulation } from "../sim/Simulation.js";
import { applyAction } from "./actions.js";

/** How long a player shows as speaking after a line, until M7 drives this from real audio. */
const SPEAKING_MS = 2500;

function sessionIdFor(roomId: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${roomId}`;
}

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
  private ledger!: LedgerWriter;
  private readonly speakingUntil = new Map<string, number>();
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
    [MSG.action]: (client: Client, raw: unknown) => this.handleAction(client, raw),
  };

  /** Validate an action, apply it, return the result to the sender, and write the ledger row. */
  private handleAction(client: Client, raw: unknown) {
    // Accept either an envelope { action, meta } or a bare Action.
    const envelope = raw && typeof raw === "object" && "action" in raw ? raw : { action: raw };
    const parsed = ActionEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => `${i.path.join(".") || "action"}: ${i.message}`).join("; ");
      const type = (envelope as { action?: { type?: unknown } }).action?.type;
      client.send(MSG.actionResult, { action: typeof type === "string" ? type : "unknown", ok: false, reason } as ActionResult);
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const { action } = parsed.data;
    const meta: ActionMeta = parsed.data.meta ?? { reason: "", trustChanges: {}, harness: null, latencyMs: null, citesPastSession: false };
    const res = applyAction(
      {
        sim: this.sim,
        nav: this.nav,
        phase: this.state.phase as Phase,
        playerId: client.sessionId,
        arrested: player.arrested,
        speak: (text, toId) => this.deliverSpeech(player, text, toId),
        hasPlayer: (id) => this.state.players.has(id),
      },
      action,
    );
    client.send(MSG.actionResult, res satisfies ActionResult);
    this.recordAction(player, action, meta, res);
  }

  private recordAction(player: PlayerSchema, action: Action, meta: ActionMeta, res: ActionResult) {
    const human = player.kind === "human";
    const entry: LedgerEntry = {
      row: {
        sessionId: this.state.sessionId,
        tick: this.state.tick,
        timestamp: new Date().toISOString(),
        phase: this.state.phase as Phase,
        actorId: player.id,
        actorName: player.name,
        actorKind: human ? "human" : "agent",
        persona: player.persona as Persona,
        action,
        reason: human ? "" : meta.reason,
        position: { x: player.position.x, y: player.position.y, z: player.position.z },
        trustChanges: meta.trustChanges,
        issue: action.type === "report_issue" ? action.issue : null,
        harness: human ? null : meta.harness,
        latencyMs: human ? null : meta.latencyMs,
      },
      ok: res.ok,
      result: res.reason,
      citesPastSession: meta.citesPastSession,
    };
    try {
      const written = this.ledger.write(entry);
      this.broadcast(MSG.ledger, [written]);
    } catch (e) {
      console.error("[ledger] failed to write row:", e);
    }
  }

  /** Speech reaches players within HEARING_RADIUS; a whisper reaches only its recipient. */
  private deliverSpeech(from: PlayerSchema, text: string, toId: string | null): number {
    const msg: SpeechMessage = { fromId: from.id, fromName: from.name, text, whisper: toId !== null, toId };
    this.speakingUntil.set(from.id, Date.now() + SPEAKING_MS);
    if (toId) {
      this.clients.get(toId)?.send(MSG.speech, msg);
      return 1;
    }
    let heard = 0;
    for (const p of this.state.players.values()) {
      if (p.id === from.id) continue;
      if (Math.hypot(p.position.x - from.position.x, p.position.z - from.position.z) > HEARING_RADIUS) continue;
      this.clients.get(p.id)?.send(MSG.speech, msg);
      heard++;
    }
    this.clients.get(from.id)?.send(MSG.speech, msg); // speakers see their own line
    return heard;
  }

  private reject(client: Client, type: string, reason: string) {
    client.send(MSG.rejected, { type, reason } satisfies RejectedMessage);
  }

  override async onCreate() {
    await initRapier();
    this.nav = await sharedNavGraph();
    this.sim = new Simulation(RAPIER);
    this.state.sessionId = sessionIdFor(this.roomId);
    this.ledger = new LedgerWriter(this.state.sessionId);
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
    client.send(MSG.ledger, this.ledger.latest(LEDGER_PANEL_ROWS));
  }

  override onLeave(client: Client) {
    this.speakingUntil.delete(client.sessionId);
    this.sim.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    this.sim?.dispose();
    this.ledger?.close();
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
    p.speaking = (this.speakingUntil.get(p.id) ?? 0) > Date.now();
    p.animation = (s.running ? "run" : s.moving ? "walk" : "idle") satisfies AnimationName;
  }
}
