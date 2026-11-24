// Entry point for running a session without Colyseus (the headless sim and tests).
import type { CrewChannel, NewsFeed } from "@neon-bay/integrations";
import { GameSession, type SessionOutput } from "./game/GameSession.js";
import { initRapier, sharedNavGraph } from "./game/shared.js";
import { LedgerWriter } from "./ledger/LedgerWriter.js";
import { DEFAULT_PHASE_CONFIG, type PhaseConfig } from "./rules/phases.js";

export { GameSession, type SessionOutput } from "./game/GameSession.js";
export type { GamePlayer, GameState } from "./game/state.js";
export { DEFAULT_PHASE_CONFIG, type PhaseConfig } from "./rules/phases.js";

export async function createHeadlessSession(opts: {
  sessionId: string;
  output: SessionOutput;
  /** Write the ledger to SQLite and JSONL (default true). */
  ledger?: boolean;
  phases?: Partial<PhaseConfig>;
  /** The planted laundering exploit; defaults to the EXPLOIT_ENABLED env var. */
  exploitEnabled?: boolean;
  /** Crew channel adapter; defaults to the stub so tests never call BAND. */
  crewChannel?: CrewChannel;
  /** Radio headlines; defaults to the stub so tests never call Telem. */
  newsFeed?: NewsFeed;
}): Promise<{ session: GameSession; close: () => void }> {
  const rapier = await initRapier();
  const nav = await sharedNavGraph();
  const ledger = opts.ledger === false ? null : new LedgerWriter(opts.sessionId);
  const session = new GameSession({
    rapier,
    nav,
    sessionId: opts.sessionId,
    output: opts.output,
    ledger,
    phases: { ...DEFAULT_PHASE_CONFIG, minHumans: 0, ...opts.phases },
    ...(opts.exploitEnabled === undefined ? {} : { exploitEnabled: opts.exploitEnabled }),
    ...(opts.crewChannel ? { crewChannel: opts.crewChannel } : {}),
    ...(opts.newsFeed ? { newsFeed: opts.newsFeed } : {}),
  });
  return {
    session,
    close: () => {
      session.dispose();
      ledger?.close();
    },
  };
}
