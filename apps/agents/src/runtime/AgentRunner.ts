// One agent's observe -> decide -> act loop (SPEC.md section 12). Runs inside a worker in
// production and in-process in tests.
import { Client, type Room } from "@colyseus/sdk";
import {
  MSG,
  ROOM_NAME,
  type ActionEnvelope,
  type ActionResult,
  type JoinOptions,
  type PlayerEvent,
  type SpeechMessage,
} from "@neon-bay/shared";
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
const RECENT_SPEECH_SIZE = 10;

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
  private readonly recentSpeech: { from: string; text: string }[] = [];
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
    room.onMessage(MSG.speech, (m: SpeechMessage) => {
      if (m.fromId === room.sessionId) return;
      this.recentSpeech.push({ from: m.fromName, text: m.whisper ? `(whispered) ${m.text}` : m.text });
      if (this.recentSpeech.length > RECENT_SPEECH_SIZE) this.recentSpeech.shift();
      this.remember(`${m.fromName} ${m.whisper ? "whispered" : "said"}: ${m.text}`);
      // SPEC: decide immediately when spoken to.
      const addressed = m.whisper || m.text.toLowerCase().includes(this.opts.persona.name.toLowerCase());
      if (addressed) this.trigger();
    });
    room.onMessage(MSG.ledger, () => {}); // agents don't render the ledger panel
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
        recentSpeech: [...this.recentSpeech],
      });
      if (!observation) return;
      this.lastDecisionAt = Date.now();
      const result = await decide(this.opts.llm, this.system, JSON.stringify(observation));
      if (this.stopped) return;
      this.decisions.push({ observation, result, at: Date.now() });
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
    if (!this.room) return;
    const d = r.decision;
    const meta = { reason: d.reason, trustChanges: d.trustChanges, harness: this.opts.llm.harness, latencyMs: r.latencyMs };
    // "wait" changes nothing on the server, but it is still a decision, so it is sent for the ledger.
    this.room.send(MSG.action, { action: d.action, meta } satisfies ActionEnvelope);
    if (d.say && d.action.type !== "say") {
      this.room.send(MSG.action, { action: { type: "say", text: d.say }, meta } satisfies ActionEnvelope);
    }
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
