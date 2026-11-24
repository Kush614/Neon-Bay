// One agent's observe -> decide -> act loop (SPEC.md section 12). Runs inside a worker in
// production and in-process in tests and the headless sim.
import {
  MSG,
  type ActionEnvelope,
  type ActionResult,
  type DealView,
  type JoinOptions,
  type PlayerEvent,
  type SpeechMessage,
  type WorldEvent,
} from "@neon-bay/shared";
import type { LlmClient } from "../llm/LlmClient.js";
import { systemPrompt, type PersonaDef } from "../personas/types.js";
import { realClock, type Clock } from "./clock.js";
import { decide, type DecideResult } from "./decide.js";
import { buildObservation, type Observation } from "./observation.js";
import { colyseusConnect, type AgentTransport, type Connect } from "./transport.js";

export const DECIDE_INTERVAL_MS = 4000;
/** Minimum gap between event-triggered decisions, so a rejection can't spin the loop. */
const MIN_TRIGGER_GAP_MS = 1000;
const SESSION_LOG_SIZE = 30;
const RECENT_SPEECH_SIZE = 10;

export interface AgentRunnerOptions {
  persona: PersonaDef;
  llm: LlmClient;
  /** Join a Colyseus server at this URL... */
  serverUrl?: string;
  /** ...or connect some other way (the headless sim). */
  connect?: Connect;
  clock?: Clock;
  decideIntervalMs?: number;
  log?: (line: string) => void;
}

export interface DecisionRecord {
  observation: Observation;
  result: DecideResult;
  at: number;
}

function describeWorld(e: WorldEvent): string {
  switch (e.type) {
    case "phase":
      return `phase is now ${e.phase}${e.seconds ? ` (${Math.round(e.seconds)} s)` : ""}`;
    case "alarm":
      return `the alarm went off (${e.cause.replace("_", " ")})`;
    case "vault_opened":
      return `the vault is open (${e.byName} was at the panel)`;
    case "bag_banked":
      return `${e.byName} banked a bag at the marina (${e.bagsBanked} banked)`;
    case "deals_settled":
      return `${e.count} deal(s) settled`;
    case "scores":
      return `final scores: ${e.scores.map((s) => `${s.name} ${s.score}`).join(", ")}`;
    case "market_crash":
      return `the market crashed: clean cash in town passed 600,000 (${e.totalCleanCash.toLocaleString("en-US")}); stake prices are falling 70%`;
    case "arrest":
      return `${e.byName} arrested ${e.targetName}${e.droppedBag ? ", who dropped a bag" : ""} (out for ${Math.round(e.seconds)} s)`;
    case "released":
      return `${e.targetName} was released`;
    case "roadblock":
      return `${e.byName} set a roadblock at (${Math.round(e.x)}, ${Math.round(e.z)})`;
    case "roadblock_cleared":
      return `a roadblock was cleared`;
    case "backup":
      return `${e.byName} called for backup at (${Math.round(e.x)}, ${Math.round(e.z)})`;
    case "radio":
      return `the radio (${e.station}) says: ${e.headline}`;
  }
}

function describeEvent(e: PlayerEvent): string {
  switch (e.type) {
    case "arrived":
      return `arrived at ${e.target}`;
    case "path_failed":
      return `could not reach ${e.target}: ${e.reason}`;
    case "crew_revealed":
      return `${e.byName} tipped off the police: the crew's positions are visible for ${Math.round(e.seconds)} s`;
    case "arrest_failed":
      return `arrest of ${e.targetName} failed: ${e.reason}`;
  }
}

export class AgentRunner {
  private transport: AgentTransport | null = null;
  private timer: unknown = null;
  private busy = false;
  private pending = false;
  private lastDecisionAt = -Infinity;
  private stopped = false;
  private lastActionResult: ActionResult | null = null;
  private readonly sessionLog: string[] = [];
  private readonly recentSpeech: { from: string; text: string }[] = [];
  private readonly deals = new Map<string, DealView>();
  private revealUntil = -Infinity;
  private backupCall: { from: string; position: { x: number; z: number }; at: number } | null = null;
  readonly decisions: DecisionRecord[] = [];
  private readonly system: string;
  private readonly log: (line: string) => void;
  private readonly clock: Clock;
  private readonly interval: number;

  constructor(private readonly opts: AgentRunnerOptions) {
    if (!opts.serverUrl && !opts.connect) throw new Error("AgentRunner needs serverUrl or connect");
    this.system = systemPrompt(opts.persona);
    this.log = opts.log ?? ((line) => console.log(`[agent:${opts.persona.id}] ${line}`));
    this.clock = opts.clock ?? realClock;
    this.interval = opts.decideIntervalMs ?? DECIDE_INTERVAL_MS;
  }

  get sessionId(): string | null {
    return this.transport?.sessionId ?? null;
  }

  get persona(): PersonaDef {
    return this.opts.persona;
  }

  /** This agent's own synced player, for tests and debugging. */
  self(): { x: number; z: number } | null {
    const t = this.transport;
    const s = t?.state();
    if (!t || !s) return null;
    for (const p of s.players) if (p.id === t.sessionId) return { x: p.position.x, z: p.position.z };
    return null;
  }

  async start(): Promise<void> {
    const { persona } = this.opts;
    const options: JoinOptions = { name: persona.name, kind: "agent", role: persona.role, persona: persona.persona };
    const connect = this.opts.connect ?? colyseusConnect(this.opts.serverUrl!);
    const t = await connect(options);
    this.transport = t;
    t.onMessage(MSG.actionResult, (r: ActionResult) => {
      this.lastActionResult = r;
      this.remember(`${r.action} ${r.ok ? "ok" : "rejected"}: ${r.reason}`);
      if (!r.ok) this.trigger(); // SPEC: decide immediately when an action is rejected
    });
    t.onMessage(MSG.event, (e: PlayerEvent) => {
      this.remember(describeEvent(e));
      if (e.type === "crew_revealed") this.revealUntil = this.clock.now() + e.seconds * 1000;
      this.trigger();
    });
    t.onMessage(MSG.speech, (m: SpeechMessage) => {
      if (m.fromId === t.sessionId) return;
      this.recentSpeech.push({ from: m.fromName, text: m.whisper ? `(whispered) ${m.text}` : m.text });
      if (this.recentSpeech.length > RECENT_SPEECH_SIZE) this.recentSpeech.shift();
      this.remember(`${m.fromName} ${m.whisper ? "whispered" : "said"}: ${m.text}`);
      // SPEC: decide immediately when spoken to.
      const addressed = m.whisper || m.text.toLowerCase().includes(this.opts.persona.name.toLowerCase());
      if (addressed) this.trigger();
    });
    t.onMessage(MSG.deal, (d: DealView) => {
      this.deals.set(d.id, d);
      const mine = d.fromId === t.sessionId;
      const offer = d.bribe ? `a bribe ${d.id} worth ${d.bribeAmount.toLocaleString("en-US")}` : `deal ${d.id} (${d.splitPercent}% of their take)`;
      this.remember(mine ? `deal ${d.id} with ${d.toName} is ${d.status}` : `${d.fromName} offered ${offer}: ${d.status}`);
      if (!mine && d.status === "pending") this.trigger(); // SPEC: decide when a deal is proposed
    });
    t.onMessage(MSG.world, (e: WorldEvent) => {
      this.remember(describeWorld(e));
      const cop = this.opts.persona.role === "cop";
      if (e.type === "backup" && e.byId !== t.sessionId) this.backupCall = { from: e.byName, position: { x: e.x, z: e.z }, at: this.clock.now() };
      // SPEC: decide immediately on a phase change, the alarm, or being arrested.
      const arrestedMe = (e.type === "arrest" || e.type === "released") && e.targetId === t.sessionId;
      if (e.type === "phase" || e.type === "alarm" || e.type === "vault_opened" || e.type === "market_crash" || arrestedMe || (cop && e.type === "backup" && e.byId !== t.sessionId)) this.trigger();
    });
    t.onMessage(MSG.ledger, () => {}); // agents don't render the ledger panel
    t.onMessage(MSG.rejected, () => {});
    t.onLeave(() => void this.stop());
    await t.ready();
    this.log(`joined as ${t.sessionId}`);
    this.schedule();
    void this.tick();
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = this.clock.setTimeout(() => {
      void this.tick();
      this.schedule();
    }, this.interval);
  }

  /** Decide now, unless a decision is already running (then decide right after it). */
  trigger(): void {
    if (this.stopped) return;
    const wait = this.lastDecisionAt + MIN_TRIGGER_GAP_MS - this.clock.now();
    if (wait > 0) this.clock.setTimeout(() => void this.tick(), wait);
    else void this.tick();
  }

  private remember(line: string): void {
    this.sessionLog.push(line);
    if (this.sessionLog.length > SESSION_LOG_SIZE) this.sessionLog.shift();
  }

  private async tick(): Promise<void> {
    const t = this.transport;
    if (this.stopped || !t) return;
    if (this.busy) {
      this.pending = true; // never run two decisions at once
      return;
    }
    const state = t.state();
    if (!state || state.phase === "ended") return;
    this.busy = true;
    try {
      const observation = buildObservation({
        state,
        selfId: t.sessionId,
        lastActionResult: this.lastActionResult,
        recentEvents: [...this.sessionLog],
        recentSpeech: [...this.recentSpeech],
        deals: [...this.deals.values()],
        police: {
          revealSecondsLeft: Math.max(0, (this.revealUntil - this.clock.now()) / 1000),
          backupCall: this.backupCall && { from: this.backupCall.from, position: this.backupCall.position, secondsAgo: Math.round((this.clock.now() - this.backupCall.at) / 1000) },
        },
      });
      if (!observation) return;
      this.lastDecisionAt = this.clock.now();
      const result = await decide(this.opts.llm, this.system, JSON.stringify(observation));
      if (this.stopped) return;
      this.decisions.push({ observation, result, at: this.clock.now() });
      this.act(result);
      this.log(`${result.decision.action.type} (${result.latencyMs} ms${result.fellBack ? ", fell back" : ""}): ${result.decision.reason}`);
    } finally {
      this.busy = false;
      if (this.pending && !this.stopped) {
        this.pending = false;
        this.trigger();
      }
    }
  }

  /** Step 3 and 4: send the action with the metadata the server needs to write the ledger row. */
  private act(r: DecideResult): void {
    const t = this.transport;
    if (!t) return;
    const d = r.decision;
    const meta = { reason: d.reason, trustChanges: d.trustChanges, harness: this.opts.llm.harness, latencyMs: r.latencyMs };
    // "wait" changes nothing on the server, but it is still a decision, so it is sent for the ledger.
    t.send(MSG.action, { action: d.action, meta } satisfies ActionEnvelope);
    if (d.say && d.action.type !== "say") {
      t.send(MSG.action, { action: { type: "say", text: d.say }, meta } satisfies ActionEnvelope);
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    const t = this.transport;
    this.transport = null;
    if (t) await t.leave();
  }
}
