// One heist session: movement simulation, rules and ledger, with no networking.
// HeistRoom drives it in real time; the headless sim steps it as fast as it can.
import {
  ActionEnvelopeSchema,
  HEARING_RADIUS,
  InputMessageSchema,
  JoinOptionsSchema,
  LEDGER_PANEL_ROWS,
  MAX_PLAYERS,
  MSG,
  STARTING_CLEAN_CASH,
  VAULT_BAGS,
  spawnPoint,
  type Action,
  type ActionMeta,
  type ActionResult,
  type DealView,
  type LedgerEntry,
  type Phase,
  type PlayerState,
  type RejectedMessage,
  type SpeechMessage,
  type WorldEvent,
  type AnimationName,
} from "@neon-bay/shared";
import type { Rapier } from "@neon-bay/shared/physics";
import type { LedgerWriter } from "../ledger/LedgerWriter.js";
import { settleDeals } from "../rules/deals.js";
import { exchangeTick, stakeValue, totalCleanCash } from "../rules/exchange.js";
import { atVaultPanel, bankAtMarina, vaultTick } from "../rules/heist.js";
import { bribeAmount, isBribe, policeTick, type Positions } from "../rules/police.js";
import { advancePhase, DEFAULT_PHASE_CONFIG, type PhaseConfig } from "../rules/phases.js";
import { computeScores } from "../rules/score.js";
import type { NavGraph } from "../sim/navmesh.js";
import { Simulation } from "../sim/Simulation.js";
import { applyAction } from "./actions.js";
import { createGameState, newPlayer, type Deal, type GamePlayer, type GameState, type Roadblock } from "./state.js";

/** How long a player shows as speaking after a line, until M7 drives this from real audio. */
const SPEAKING_SECONDS = 2.5;
/** How often a cop making an arrest re-paths toward the target. */
const CHASE_REPATH_SECONDS = 0.5;
/** A roadblock barrier: 10 m across the road. */
const ROADBLOCK_HALF = { x: 5, y: 0.6, z: 0.4 };

/** EXPLOIT_ENABLED defaults on so the griefer has something to find; set it to "false" to close it. */
export function exploitEnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return (env.EXPLOIT_ENABLED ?? "true").toLowerCase() !== "false";
}

/** Where the session's messages go: Colyseus clients in the room, or in-process agents in the sim. */
export interface SessionOutput {
  toPlayer(id: string, type: string, payload: unknown): void;
  broadcast(type: string, payload: unknown): void;
}

export interface GameSessionOptions {
  rapier: Rapier;
  nav: NavGraph;
  sessionId: string;
  output: SessionOutput;
  ledger?: LedgerWriter | null;
  phases?: PhaseConfig;
  /** Wall clock for ledger timestamps. */
  now?: () => Date;
  /** The planted laundering exploit (SPEC.md section 11). Defaults to EXPLOIT_ENABLED. */
  exploitEnabled?: boolean;
}

const NO_META: ActionMeta = { reason: "", trustChanges: {}, harness: null, latencyMs: null, citesPastSession: false };

export class GameSession {
  readonly state: GameState;
  readonly sim: Simulation;
  readonly nav: NavGraph;
  private readonly out: SessionOutput;
  private readonly ledger: LedgerWriter | null;
  private readonly phases: PhaseConfig;
  private readonly now: () => Date;
  private readonly speakingUntil = new Map<string, number>();
  private nextSpawn = 0;
  private humanCount = 0;
  private chaseTimer = 0;

  constructor(opts: GameSessionOptions) {
    this.sim = new Simulation(opts.rapier);
    this.nav = opts.nav;
    this.out = opts.output;
    this.ledger = opts.ledger ?? null;
    this.phases = opts.phases ?? DEFAULT_PHASE_CONFIG;
    this.now = opts.now ?? (() => new Date());
    this.state = createGameState(opts.sessionId, VAULT_BAGS, opts.exploitEnabled ?? exploitEnabledFromEnv());
  }

  get phase(): Phase {
    return this.state.phase;
  }

  // ---- membership -----------------------------------------------------------

  addPlayer(id: string, rawOptions: unknown): GamePlayer {
    const o = JoinOptionsSchema.parse(rawOptions ?? {});
    if (o.kind === "human") this.humanCount++;
    const role = o.role ?? (o.kind === "human" ? "human" : "fixer");
    // Cops start at the police station; everyone else meets at the nightclub.
    this.sim.addPlayer(id, role === "cop" ? spawnPoint("police_station", this.nextSpawn++ % 2) : spawnPoint("nightclub", this.nextSpawn++ % MAX_PLAYERS));
    const p = newPlayer({
      id,
      name: o.name ?? (o.kind === "human" ? `Player ${this.humanCount}` : "Agent"),
      kind: o.kind,
      role,
      persona: o.persona ?? "none",
      cleanCash: role === "cop" ? 0 : STARTING_CLEAN_CASH,
    });
    this.state.players.set(id, p);
    return p;
  }

  removePlayer(id: string): void {
    const p = this.state.players.get(id);
    // A bag carried out of the session goes back in the vault, so it isn't lost to a disconnect.
    if (p?.carryingBag) this.state.vault.bagsLeft++;
    for (const [copId, a] of this.state.arrests) if (copId === id || a.targetId === id) this.state.arrests.delete(copId);
    this.speakingUntil.delete(id);
    this.sim.removePlayer(id);
    this.state.players.delete(id);
  }

  latestLedger(n = LEDGER_PANEL_ROWS): LedgerEntry[] {
    return this.ledger?.latest(n) ?? [];
  }

  // ---- inputs ---------------------------------------------------------------

  /** Human movement or driving input. Returns a rejection to send back, or null. */
  input(id: string, raw: unknown): RejectedMessage | null {
    const parsed = InputMessageSchema.safeParse(raw);
    if (!parsed.success) return { type: MSG.input, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (this.state.players.get(id)?.arrested) return null;
    this.sim.setInput(id, parsed.data);
    return null;
  }

  setReady(id: string, ready: boolean): void {
    const p = this.state.players.get(id);
    if (p && this.state.phase === "lobby") p.ready = ready;
  }

  /** Human "use" key: enter the nearest free car, or get out of the current one. */
  toggleVehicle(id: string): RejectedMessage | null {
    if (this.sim.vehicleOf(id)) {
      this.exitVehicle(id);
      return null;
    }
    const car = this.sim.nearestFreeVehicle(id);
    if (!car) return { type: MSG.useVehicle, reason: "no free car within reach" };
    this.enterVehicle(id, car.id);
    return null;
  }

  enterVehicle(id: string, vehicleId: string): boolean {
    return this.sim.enterVehicle(id, vehicleId);
  }

  exitVehicle(id: string): boolean {
    return this.sim.exitVehicle(id);
  }

  /** Validate an action (an envelope { action, meta } or a bare Action), apply it, and write the ledger row. */
  submit(id: string, raw: unknown): ActionResult {
    const envelope = raw && typeof raw === "object" && "action" in raw ? raw : { action: raw };
    const parsed = ActionEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => `${i.path.join(".") || "action"}: ${i.message}`).join("; ");
      return { action: "invalid", ok: false, reason };
    }
    const player = this.state.players.get(id);
    if (!player) return { action: parsed.data.action.type, ok: false, reason: "player is not in the session" };
    const res = applyAction(this, id, parsed.data.action);
    this.record(player, parsed.data.action, parsed.data.meta ?? NO_META, res);
    return res;
  }

  private record(player: GamePlayer, action: Action, meta: ActionMeta, res: ActionResult): void {
    if (!this.ledger) return;
    const human = player.kind === "human";
    const pos = this.sim.snapshot(player.id)?.position ?? { x: 0, y: 0, z: 0 };
    const entry: LedgerEntry = {
      row: {
        sessionId: this.state.sessionId,
        tick: this.state.tick,
        timestamp: this.now().toISOString(),
        phase: this.state.phase,
        actorId: player.id,
        actorName: player.name,
        actorKind: player.kind,
        persona: player.persona,
        action,
        reason: human ? "" : meta.reason,
        position: pos,
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
      this.out.broadcast(MSG.ledger, [this.ledger.write(entry)]);
    } catch (e) {
      console.error("[ledger] failed to write row:", e);
    }
  }

  // ---- outputs used by actions ---------------------------------------------

  /** Speech reaches players within HEARING_RADIUS; a whisper reaches only its recipient. Returns how many heard it. */
  speak(fromId: string, text: string, toId: string | null): number {
    const from = this.state.players.get(fromId);
    const fromPos = this.sim.snapshot(fromId)?.position;
    if (!from || !fromPos) return 0;
    const msg: SpeechMessage = { fromId, fromName: from.name, text, whisper: toId !== null, toId };
    this.speakingUntil.set(fromId, this.state.time + SPEAKING_SECONDS);
    this.out.toPlayer(fromId, MSG.speech, msg); // speakers see their own line
    if (toId) {
      this.out.toPlayer(toId, MSG.speech, msg);
      return 1;
    }
    let heard = 0;
    for (const p of this.state.players.values()) {
      if (p.id === fromId) continue;
      const pos = this.sim.snapshot(p.id)?.position;
      if (!pos || Math.hypot(pos.x - fromPos.x, pos.z - fromPos.z) > HEARING_RADIUS) continue;
      this.out.toPlayer(p.id, MSG.speech, msg);
      heard++;
    }
    return heard;
  }

  isSpeaking(id: string): boolean {
    return (this.speakingUntil.get(id) ?? 0) > this.state.time;
  }

  dealView(d: Deal): DealView {
    const name = (id: string) => this.state.players.get(id)?.name ?? id;
    const bribe = isBribe(this.state, d);
    return {
      id: d.id,
      fromId: d.fromId,
      fromName: name(d.fromId),
      toId: d.toId,
      toName: name(d.toId),
      splitPercent: d.splitPercent,
      note: d.note,
      status: d.status,
      settledAmount: d.settledAmount,
      bribe,
      bribeAmount: bribe && d.status === "pending" ? bribeAmount(this.state, d) : 0,
    };
  }

  // ---- police hooks used by actions ------------------------------------------

  /** Road edges closed by roadblocks, for drive_to routing. */
  blockedRoads(): Set<string> {
    return new Set([...this.state.roadblocks.values()].map((r) => r.edge));
  }

  positions(): Positions {
    return {
      pos: (id) => this.sim.snapshot(id)?.position ?? null,
      onFoot: (id) => this.sim.has(id) && !this.sim.vehicleOf(id),
    };
  }

  /** A cop making an arrest runs at the target; the path is refreshed as the target moves. */
  chase(copId: string, targetId: string): void {
    const from = this.sim.snapshot(copId)?.position;
    const to = this.sim.snapshot(targetId)?.position;
    if (!from || !to) return;
    const path = this.nav.path(from, to);
    if (path) this.sim.setPath(copId, path, this.state.players.get(targetId)?.name ?? targetId, true);
  }

  onTipOff(by: GamePlayer, alarmRaised: boolean): void {
    if (alarmRaised) this.world({ type: "alarm", cause: "tip_off" });
    for (const p of this.state.players.values()) {
      if (p.role === "cop") this.out.toPlayer(p.id, MSG.event, { type: "crew_revealed", seconds: this.state.revealUntil - this.state.time, byName: by.name });
    }
  }

  onRoadblock(by: GamePlayer, rb: Roadblock): void {
    this.sim.addObstacle(rb.id, rb, ROADBLOCK_HALF, rb.heading);
    this.world({ type: "roadblock", id: rb.id, byName: by.name, x: rb.x, z: rb.z, seconds: rb.until - this.state.time });
  }

  onBackup(by: GamePlayer): void {
    const pos = this.sim.snapshot(by.id)?.position ?? { x: 0, z: 0 };
    this.world({ type: "backup", byId: by.id, byName: by.name, x: pos.x, z: pos.z });
  }

  stakeValueOf(id: string): number {
    const p = this.state.players.get(id);
    return p ? stakeValue(this.state, p) : 0;
  }

  publishDeal(d: Deal): void {
    const view = this.dealView(d);
    this.out.toPlayer(d.fromId, MSG.deal, view);
    this.out.toPlayer(d.toId, MSG.deal, view);
  }

  private world(e: WorldEvent): void {
    this.out.broadcast(MSG.world, e);
  }

  // ---- stepping -------------------------------------------------------------

  /** One server tick: `subSteps` physics steps of `subDt` seconds, with the rules after each. */
  tick(subSteps: number, subDt: number): void {
    for (let i = 0; i < subSteps; i++) {
      this.sim.step(subDt);
      this.rules(subDt);
    }
    this.state.tick++;
    for (const { id, event } of this.sim.drainEvents()) this.out.toPlayer(id, MSG.event, event);
  }

  private rules(dt: number): void {
    const s = this.state;
    const entered = advancePhase(s, dt, this.phases);
    if (entered) this.onPhase(entered);

    const positions = new Map<string, { x: number; z: number }>();
    for (const p of s.players.values()) {
      const snap = this.sim.snapshot(p.id);
      if (snap) positions.set(p.id, snap.position);
    }
    if (vaultTick(s, positions, dt)) {
      const atPanel = [...s.players.values()].filter((p) => p.role !== "cop" && atVaultPanel(positions.get(p.id) ?? { x: 1e9, z: 1e9 }));
      const at = atPanel.find((p) => p.role === "hacker") ?? atPanel[0];
      this.world({ type: "vault_opened", byName: at?.name ?? "someone" });
      this.world({ type: "alarm", cause: "vault_opened" });
    }
    for (const p of s.players.values()) {
      const pos = positions.get(p.id);
      if (pos && bankAtMarina(s, p, pos)) {
        this.sim.setCarryingBag(p.id, false);
        this.world({ type: "bag_banked", byName: p.name, bagsBanked: s.bagsBanked });
      }
    }
    if (exchangeTick(s)) this.world({ type: "market_crash", totalCleanCash: totalCleanCash(s) });
    this.police(dt);
  }

  private police(dt: number): void {
    const s = this.state;
    const name = (id: string) => s.players.get(id)?.name ?? id;
    const r = policeTick(s, this.positions(), dt);
    for (const { attempt, droppedBag } of r.arrested) {
      const target = s.players.get(attempt.targetId)!;
      this.sim.stop(target.id);
      this.sim.stop(attempt.copId);
      if (droppedBag) this.sim.setCarryingBag(target.id, false);
      this.world({ type: "arrest", targetId: target.id, targetName: target.name, byName: name(attempt.copId), seconds: target.arrestedUntil - s.time, droppedBag: !!droppedBag });
    }
    for (const { attempt, reason } of r.failed) {
      this.sim.stop(attempt.copId);
      this.out.toPlayer(attempt.copId, MSG.event, { type: "arrest_failed", targetName: name(attempt.targetId), reason });
    }
    for (const p of r.released) this.world({ type: "released", targetId: p.id, targetName: p.name });
    for (const rb of r.clearedRoadblocks) {
      this.sim.removeObstacle(rb.id);
      this.world({ type: "roadblock_cleared", id: rb.id });
    }
    this.chaseTimer += dt;
    if (this.chaseTimer >= CHASE_REPATH_SECONDS) {
      this.chaseTimer = 0;
      for (const a of s.arrests.values()) this.chase(a.copId, a.targetId);
    }
  }

  private onPhase(phase: Phase): void {
    const s = this.state;
    if (phase === "payout") {
      const settled = settleDeals(s);
      for (const d of settled) this.publishDeal(d);
      this.world({ type: "deals_settled", count: settled.length });
    }
    if (phase === "ended") {
      // Unbanked bags are lost when the session ends.
      for (const p of s.players.values()) {
        if (p.carryingBag) {
          p.carryingBag = false;
          this.sim.setCarryingBag(p.id, false);
        }
      }
      s.droppedBags = [];
      s.arrests.clear();
      computeScores(s, (id) => this.stakeValueOf(id));
      this.world({ type: "scores", scores: [...s.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score })) });
    }
    this.world({ type: "phase", phase, seconds: s.phaseTimeLeft });
  }

  /** A player as clients see them: game state merged with the simulation. */
  playerView(id: string): PlayerState | null {
    const g = this.state.players.get(id);
    const snap = this.sim.snapshot(id);
    if (!g || !snap) return null;
    const animation: AnimationName = g.arrested ? "hands_up" : snap.vehicleId ? "drive" : g.carryingBag && snap.moving ? "carry_bag" : snap.running ? "run" : snap.moving ? "walk" : "idle";
    return {
      id,
      name: g.name,
      kind: g.kind,
      role: g.role,
      persona: g.persona,
      position: snap.position,
      heading: snap.heading,
      animation,
      vehicleId: snap.vehicleId,
      dirtyCash: g.dirtyCash,
      cleanCash: g.cleanCash,
      carryingBag: g.carryingBag,
      arrested: g.arrested,
      speaking: this.isSpeaking(id),
    };
  }

  lastInputSeq(id: string): number {
    return this.sim.snapshot(id)?.lastSeq ?? -1;
  }

  dispose(): void {
    this.sim.dispose();
  }
}
