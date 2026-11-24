// A full headless session: GameSession + in-process agents on a virtual clock,
// stepped as fast as the CPU allows (SPEC.md section 18).
import { MSG, SUBSTEPS_PER_TICK, TICK_RATE_HZ, type LedgerEntry, type Phase, type WorldEvent } from "@neon-bay/shared";
import { createHeadlessSession, type PhaseConfig } from "@neon-bay/server/headless";
import { createLlmClient } from "../llm/index.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { PERSONAS, type PersonaDef } from "../personas/index.js";
import { AgentRunner } from "../runtime/AgentRunner.js";
import { VirtualClock } from "../runtime/clock.js";
import type { CrewChannel } from "@neon-bay/integrations";
import { LocalHub } from "./LocalHub.js";

export interface SimOptions {
  seed: number;
  personas?: PersonaDef[];
  /** Build each agent's model client. Defaults to createLlmClient (LLM_PROVIDER, stub by default). */
  llmFor?: (persona: PersonaDef, seed: number) => LlmClient;
  phases?: Partial<PhaseConfig>;
  /** Safety cap on simulated seconds. */
  maxSeconds?: number;
  log?: (line: string) => void;
  /** Crew channel adapter (BAND or stub); the stub by default, so tests never call BAND. */
  crewChannel?: CrewChannel;
}

export interface SimResult {
  sessionId: string;
  completed: boolean;
  phases: Phase[];
  simulatedSeconds: number;
  wallMs: number;
  scores: { id: string; name: string; role: string; score: number; dirtyCash: number; cleanCash: number }[];
  bagsBanked: number;
  ledgerRows: number;
  issues: LedgerEntry[];
  decisions: number;
}

const TICK_MS = 1000 / TICK_RATE_HZ;

export async function runSim(opts: SimOptions): Promise<SimResult> {
  const started = performance.now();
  const log = opts.log ?? (() => {});
  const sessionId = `sim-seed${opts.seed}-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
  const hub = new LocalHub();
  const phases: Phase[] = [];
  const ledger: LedgerEntry[] = [];
  const { session, close } = await createHeadlessSession({
    sessionId,
    phases: opts.phases,
    ...(opts.crewChannel ? { crewChannel: opts.crewChannel } : {}),
    output: {
      toPlayer: hub.output.toPlayer,
      broadcast: (type, payload) => {
        if (type === MSG.ledger) ledger.push(...(payload as LedgerEntry[]));
        if (type === MSG.world) {
          const e = payload as WorldEvent;
          if (e.type === "phase") phases.push(e.phase);
          if (e.type !== "phase") log(`[world] ${JSON.stringify(e)}`);
          else log(`[world] phase ${e.phase}`);
        }
        hub.output.broadcast(type, payload);
      },
    },
  });
  hub.attach(session);

  const clock = new VirtualClock();
  const personas = opts.personas ?? Object.values(PERSONAS);
  const llmFor = opts.llmFor ?? ((p, seed) => createLlmClient(p, process.env, { seed }));
  const runners = personas.map(
    (p) => new AgentRunner({ persona: p, llm: llmFor(p, opts.seed), connect: hub.connect, clock, log: (l) => log(`[${p.id}] ${l}`) }),
  );
  for (const r of runners) await r.start();

  const maxTicks = ((opts.maxSeconds ?? 900) * 1000) / TICK_MS;
  let ticks = 0;
  let scores: SimResult["scores"];
  try {
    while (session.phase !== "ended" && ticks < maxTicks) {
      session.tick(SUBSTEPS_PER_TICK, 1 / (TICK_RATE_HZ * SUBSTEPS_PER_TICK));
      clock.advance(TICK_MS);
      ticks++;
      // Let agent decisions (promises) and message deliveries (microtasks) run between ticks.
      await new Promise<void>((r) => setImmediate(r));
    }
    // Read scores before the agents leave, since leaving removes their players.
    scores = [...session.state.players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, score: p.score, dirtyCash: p.dirtyCash, cleanCash: p.cleanCash }));
  } finally {
    for (const r of runners) await r.stop();
  }

  const result: SimResult = {
    sessionId,
    completed: session.phase === "ended",
    phases,
    simulatedSeconds: (ticks * TICK_MS) / 1000,
    wallMs: Math.round(performance.now() - started),
    scores,
    bagsBanked: session.state.bagsBanked,
    ledgerRows: ledger.length,
    issues: ledger.filter((e) => e.row.issue),
    decisions: runners.reduce((n, r) => n + r.decisions.length, 0),
  };
  close();
  return result;
}
