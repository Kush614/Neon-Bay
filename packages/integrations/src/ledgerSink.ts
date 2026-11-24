// LedgerSink and ReportSource (SPEC.md section 16, Bruin): ship each session's ledger to the
// warehouse that the Bruin pipeline transforms, and read the report tables back.
// Select with LEDGER_SINK=bruin|stub (stub by default); the game runs fully stubbed.
import type { LedgerEntry } from "@neon-bay/shared";

export interface LedgerSink {
  readonly name: string;
  /** Replace everything stored for this session with these entries. */
  writeSession(sessionId: string, entries: LedgerEntry[]): Promise<number>;
  close(): Promise<void>;
}

export type ReportTable = "phase_times" | "issues" | "stuck_points" | "action_sequences" | "heatmap";
export const REPORT_TABLES: readonly ReportTable[] = ["phase_times", "issues", "stuck_points", "action_sequences", "heatmap"];

export interface ReportSource {
  readonly name: string;
  /** Rows of one report table, for one session where the table is per session. */
  read(table: ReportTable, sessionId?: string): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export class StubLedgerSink implements LedgerSink {
  readonly name = "stub";
  readonly sessions = new Map<string, number>();
  async writeSession(sessionId: string, entries: LedgerEntry[]): Promise<number> {
    this.sessions.set(sessionId, entries.length);
    return entries.length;
  }
  async close(): Promise<void> {}
}

export class StubReportSource implements ReportSource {
  readonly name = "stub";
  async read(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async close(): Promise<void> {}
}
