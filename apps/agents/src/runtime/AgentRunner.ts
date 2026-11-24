// One agent's observe -> decide -> act loop (SPEC.md section 12). Runs inside a worker in
// production and in-process in tests.
import { Client, type Room } from "@colyseus/sdk";
import { MSG, ROOM_NAME, type ActionResult, type Decision, type JoinOptions, type PlayerEvent } from "@neon-bay/shared";
import type { LlmClient } from "../llm/LlmClient.js";
import { systemPrompt, type PersonaDef } from "../personas/types.js";
import { decide, type DecideResult } from "./decide.js";
import { buildObservation, type Observation, type ObservedPlayer } from "./observation.js";

/** The synced room state as the SDK decodes it (players is a MapSchema, which behaves like a Map). */
interface RoomState {
  phase: string;
  players: Map<string, ObservedPlayer>;
}

export const DECIDE_INTERVAL_MS = 4000;
/** Minimum gap between event-triggered decisions, so a rejection can't spin the loop. */
const MIN_TRIGGER_GAP_MS = 1000;
const SESSION_LOG_SIZE = 30;

export interface AgentRunnerOptions {
  persona: PersonaDef;
  llm: LlmClient;
  serverUrl: string;
  decideIntervalMs?: number;
  log?: (line: string) => void;
}

export interface DecisionRecord {
  observation: Observation;
  result: DecideResult;
  at: number;
}

export class AgentRunner {
  private room: Room<unknown, RoomState> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private pending = false;
  private lastDecisionAt = 0;
  private stopped = false;
  private lastActionResult: ActionResult | null = null;
  private readonly sessionLog: string[] = [];
  readonly decisions: DecisionRecord[] = [];
  private readonly system: string;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: AgentRunnerOptions) {
    this.system = systemPrompt(opts.persona);
    this.log = opts.log ?? ((line) => console.log(`[agent:${opts.persona.id}] ${line}`));
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  /** This agent's own synced player, for tests and debugging. */
  self(): { x: number; z: number } | null {
    const id = this.sessionId;
    if (!id || !this.room?.state) return null;
    const p = this.room.state.players?.get(id);
    return p ? { x: p.position.x, z: p.position.z } : null;
  }

  async start(): Promise<void> {
    const { persona } = this.opts;
    const options: JoinOptions = { name: persona.name, kind: "agent", role: persona.role, persona: persona.persona };
    const client = new Client(this.opts.serverUrl);
    const room = await client.joinOrCreate<RoomState>(ROOM_NAME, options);
    this.room = room;
    room.onMessage(MSG.actionResult, (r: ActionResult) => {
      this.lastActionResult = r;
      this.remember(`${r.action} ${r.ok ? "ok" : "rejected"}: ${r.reason}`);
      if (!r.ok) this.trigger(); // SPEC: decide immediately when an action is rejected
    });
    room.onMessage(MSG.event, (e: PlayerEvent) => {
      this.remember(e.type === "arrived" ? `arrived at ${e.target}` : `could not reach ${e.target}: ${e.reason}`);
      this.trigger();
    });
    room.onLeave(() => this.stop());
    // Wait for the first state so the first observation has our own player in it.
    await new Promise<void>((resolve) => {
      if (this.self()) return resolve();
      const done = () => {
        if (this.self()) {
          room.onStateChange.remove(done);
          resolve();
        }
      };
      room.onStateChange(done);
    });
    this.log(`joined as ${room.sessionId}`);
    this.timer = setInterval(() => void this.tick(), this.opts.decideIntervalMs ?? DECIDE_INTERVAL_MS);
    void this.tick();
  }

  /** Decide now, unless a decision is already running (then decide right after it). */
  trigger(): void {
    if (this.stopped) return;
    const wait = this.lastDecisionAt + MIN_TRIGGER_GAP_MS - Date.now();
    if (wait > 0) setTimeout(() => void this.tick(), wait);
    else void this.tick();
  }

  private remember(line: string): void {
    this.sessionLog.push(line);
    if (this.sessionLog.length > SESSION_LOG_SIZE) this.sessionLog.shift();
  }

  private async tick(): Promise<void> {
    if (this.stopped || !this.room) return;
    if (this.busy) {
      this.pending = true; // never run two decisions at once
      return;
    }
    this.busy = true;
    try {
      const observation = buildObservation({
        state: { phase: this.room.state.phase, players: this.room.state.players.values() },
        selfId: this.room.sessionId,
        lastActionResult: this.lastActionResult,
        recentEvents: [...this.sessionLog],
      });
      if (!observation) return;
      this.lastDecisionAt = Date.now();
      const result = await decide(this.opts.llm, this.system, JSON.stringify(observation));
      if (this.stopped) return;
      this.decisions.push({ observation, result, at: Date.now() });
      this.act(result.decision);
      this.log(`${result.decision.action.type} (${result.latencyMs} ms${result.fellBack ? ", fell back" : ""}): ${result.decision.reason}`);
    } finally {
      this.busy = false;
      if (this.pending && !this.stopped) {
        this.pending = false;
        this.trigger();
      }
    }
  }

  private act(d: Decision): void {
    if (!this.room) return;
    // "wait" keeps doing whatever the character was already doing; nothing to send.
    if (d.action.type !== "wait") this.room.send(MSG.action, d.action);
    if (d.say) this.room.send(MSG.action, { type: "say", text: d.say });
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    const room = this.room;
    this.room = null;
    if (room) await room.leave().catch(() => {});
  }
}
