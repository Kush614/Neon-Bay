// Colyseus room: networking around a GameSession. All game logic lives in the session.
import { Room, type Client, type StepContext } from "colyseus";
import {
  BUSINESSES,
  MAX_PLAYERS,
  MSG,
  PATCH_RATE_HZ,
  ReadyMessageSchema,
  SUBSTEPS_PER_TICK,
  TICK_RATE_HZ,
  type RejectedMessage,
} from "@neon-bay/shared";
import { createCrewChannel } from "@neon-bay/integrations";
import { GameSession } from "../game/GameSession.js";
import { initRapier, sharedNavGraph } from "../game/shared.js";
import { LedgerWriter } from "../ledger/LedgerWriter.js";
import { DEFAULT_PHASE_CONFIG } from "../rules/phases.js";
import { prices } from "../rules/exchange.js";
import { BusinessSchema, DroppedBagSchema, HeistStateSchema, PlayerSchema, RoadblockSchema, Vec3Schema, VehicleSchema } from "../schema.js";

function sessionIdFor(roomId: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${roomId}`;
}

/** Humans who must be ready before the lobby ends. MIN_HUMANS overrides the spec's 2 for solo testing. */
function minHumans(): number {
  const n = Number(process.env.MIN_HUMANS);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_PHASE_CONFIG.minHumans;
}

export class HeistRoom extends Room<{ state: HeistStateSchema }> {
  override maxClients = MAX_PLAYERS;
  override patchRate = 1000 / PATCH_RATE_HZ;
  override maxMessagesPerSecond = 120;
  override state = new HeistStateSchema();
  private session!: GameSession;
  private ledger!: LedgerWriter;

  override messages = {
    // Invalid messages are rejected with a reason instead of disconnecting the sender.
    [MSG.input]: (client: Client, raw: unknown) => this.reply(client, this.session.input(client.sessionId, raw)),
    [MSG.action]: (client: Client, raw: unknown) => client.send(MSG.actionResult, this.session.submit(client.sessionId, raw)),
    [MSG.ready]: (client: Client, raw: unknown) => {
      const parsed = ReadyMessageSchema.safeParse(raw);
      if (!parsed.success) return this.reply(client, { type: MSG.ready, reason: "expected { ready: boolean }" });
      this.session.setReady(client.sessionId, parsed.data.ready);
    },
    [MSG.useVehicle]: (client: Client) => this.reply(client, this.session.toggleVehicle(client.sessionId)),
  };

  private reply(client: Client, rejection: RejectedMessage | null) {
    if (rejection) client.send(MSG.rejected, rejection);
  }

  override async onCreate() {
    const rapier = await initRapier();
    const nav = await sharedNavGraph();
    this.state.sessionId = sessionIdFor(this.roomId);
    this.ledger = new LedgerWriter(this.state.sessionId);
    this.session = new GameSession({
      rapier,
      nav,
      sessionId: this.state.sessionId,
      ledger: this.ledger,
      phases: { ...DEFAULT_PHASE_CONFIG, minHumans: minHumans() },
      crewChannel: createCrewChannel(process.env),
      output: {
        toPlayer: (id, type, payload) => this.clients.get(id)?.send(type, payload),
        broadcast: (type, payload) => this.broadcast(type, payload),
      },
    });
    for (const v of this.session.sim.vehicles.values()) {
      const s = new VehicleSchema();
      s.id = v.id;
      s.label = v.spec.label;
      s.color = v.spec.color;
      s.position = new Vec3Schema();
      s.driverId = "";
      this.state.vehicles.set(v.id, s);
    }
    for (const b of Object.values(BUSINESSES)) {
      const q = new BusinessSchema();
      q.id = b.id;
      q.label = b.label;
      q.price = b.startPrice;
      this.state.market.set(b.id, q);
    }
    this.sync();
    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE_HZ, { subSteps: SUBSTEPS_PER_TICK });
  }

  override onJoin(client: Client, rawOptions: unknown) {
    const g = this.session.addPlayer(client.sessionId, rawOptions);
    const p = new PlayerSchema();
    p.id = g.id;
    p.name = g.name;
    p.kind = g.kind;
    p.role = g.role;
    p.persona = g.persona;
    p.position = new Vec3Schema();
    p.vehicleId = "";
    p.lastInputSeq = -1;
    this.state.players.set(client.sessionId, p);
    this.sync();
    client.send(MSG.ledger, this.session.latestLedger());
  }

  override onLeave(client: Client) {
    this.session.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    this.session?.dispose();
    this.ledger?.close();
  }

  private step(ctx: StepContext) {
    this.session.tick(ctx.subSteps, ctx.subDt);
    this.sync();
  }

  /** Copy session state into the synced schema. */
  private sync() {
    const g = this.session.state;
    const s = this.state;
    s.tick = g.tick;
    s.phase = g.phase;
    s.phaseTimeLeft = g.phaseTimeLeft;
    s.alarm = g.alarm;
    s.vaultProgress = g.vault.progress;
    s.vaultOpen = g.vault.open;
    s.bagsLeft = g.vault.bagsLeft;
    s.bagsBanked = g.bagsBanked;
    for (const p of s.players.values()) {
      const v = this.session.playerView(p.id);
      const gp = g.players.get(p.id);
      if (!v || !gp) continue;
      p.position.x = v.position.x;
      p.position.y = v.position.y;
      p.position.z = v.position.z;
      p.heading = v.heading;
      p.animation = v.animation;
      p.vehicleId = v.vehicleId ?? "";
      p.speaking = v.speaking;
      p.dirtyCash = v.dirtyCash;
      p.cleanCash = v.cleanCash;
      p.carryingBag = v.carryingBag;
      p.arrested = v.arrested;
      p.lastInputSeq = this.session.lastInputSeq(p.id);
      p.ready = gp.ready;
      p.score = gp.score;
      p.stakeValue = this.session.stakeValueOf(p.id);
    }
    const quotes = prices(g);
    for (const [id, q] of s.market) q.price = quotes[id as keyof typeof quotes];
    s.marketCrashed = g.exchange.crashedAt !== null;
    for (const id of [...s.roadblocks.keys()]) if (!g.roadblocks.has(id)) s.roadblocks.delete(id);
    for (const rb of g.roadblocks.values()) {
      if (s.roadblocks.has(rb.id)) continue;
      const r = new RoadblockSchema();
      Object.assign(r, { id: rb.id, x: rb.x, z: rb.z, heading: rb.heading });
      s.roadblocks.set(rb.id, r);
    }
    const bags = new Set(g.droppedBags.map((b) => b.id));
    for (const id of [...s.droppedBags.keys()]) if (!bags.has(id)) s.droppedBags.delete(id);
    for (const b of g.droppedBags) {
      if (s.droppedBags.has(b.id)) continue;
      const d = new DroppedBagSchema();
      Object.assign(d, { id: b.id, x: b.x, z: b.z });
      s.droppedBags.set(b.id, d);
    }
    for (const v of this.session.sim.vehicleSnapshots()) {
      const vs = s.vehicles.get(v.id);
      if (!vs) continue;
      vs.position.x = v.position.x;
      vs.position.y = v.position.y;
      vs.position.z = v.position.z;
      vs.heading = v.heading;
      vs.speed = v.speed;
      vs.driverId = v.driverId ?? "";
    }
  }
}
