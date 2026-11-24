// The warehouse behind the Bruin pipeline (pipelines/neon-bay-ledger). Bruin's docs: MotherDuck
// connections use the duckdb.* asset types, so the same SQL runs on a local DuckDB file and on
// MotherDuck. Here, a local path ("data/warehouse.duckdb") or "md:<database>" with
// MOTHERDUCK_TOKEN in the environment (DuckDB's own MotherDuck convention).
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { TICK_RATE_HZ, type LedgerEntry } from "@neon-bay/shared";
import type { LedgerSink, ReportSource, ReportTable } from "../ledgerSink.js";

export const RAW_LEDGER_DDL = `
CREATE SCHEMA IF NOT EXISTS raw;
CREATE TABLE IF NOT EXISTS raw.ledger (
  session_id VARCHAR NOT NULL,
  tick BIGINT NOT NULL,
  game_seconds DOUBLE NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  phase VARCHAR NOT NULL,
  actor_id VARCHAR NOT NULL,
  actor_name VARCHAR NOT NULL,
  actor_kind VARCHAR NOT NULL,
  persona VARCHAR,
  action_type VARCHAR NOT NULL,
  action JSON NOT NULL,
  reason VARCHAR,
  x DOUBLE, y DOUBLE, z DOUBLE,
  trust_changes JSON,
  issue_type VARCHAR,
  issue_severity VARCHAR,
  issue_description VARCHAR,
  harness VARCHAR,
  latency_ms DOUBLE,
  ok BOOLEAN NOT NULL,
  result VARCHAR,
  cites_past_session BOOLEAN NOT NULL,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

const COLUMNS = [
  "session_id", "tick", "game_seconds", "ts", "phase", "actor_id", "actor_name", "actor_kind", "persona", "action_type", "action", "reason",
  "x", "y", "z", "trust_changes", "issue_type", "issue_severity", "issue_description", "harness", "latency_ms", "ok", "result", "cites_past_session",
] as const;

type Cell = string | number | boolean | null;

export function flatten(e: LedgerEntry): Cell[] {
  const r = e.row;
  return [
    r.sessionId, r.tick, r.tick / TICK_RATE_HZ, r.timestamp, r.phase, r.actorId, r.actorName, r.actorKind, r.persona ?? null, r.action.type,
    JSON.stringify(r.action), r.reason || null, r.position.x, r.position.y, r.position.z, JSON.stringify(r.trustChanges),
    r.issue?.type ?? null, r.issue?.severity ?? null, r.issue?.description ?? null, r.harness, r.latencyMs, e.ok, e.result || null, e.citesPastSession,
  ];
}

async function connect(path: string): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(path);
  return instance.connect();
}

export class BruinLedgerSink implements LedgerSink {
  readonly name = "bruin";
  private conn: Promise<DuckDBConnection> | null = null;
  constructor(readonly path: string) {}

  private db(): Promise<DuckDBConnection> {
    this.conn ??= connect(this.path).then(async (c) => {
      await c.run(RAW_LEDGER_DDL);
      return c;
    });
    return this.conn;
  }

  async writeSession(sessionId: string, entries: LedgerEntry[]): Promise<number> {
    const c = await this.db();
    const placeholders = `(${COLUMNS.map(() => "?").join(", ")})`;
    await c.run("BEGIN TRANSACTION");
    try {
      await c.run("DELETE FROM raw.ledger WHERE session_id = ?", [sessionId]);
      for (let i = 0; i < entries.length; i += 200) {
        const batch = entries.slice(i, i + 200);
        await c.run(`INSERT INTO raw.ledger (${COLUMNS.join(", ")}) VALUES ${batch.map(() => placeholders).join(", ")}`, batch.flatMap(flatten));
      }
      await c.run("COMMIT");
    } catch (e) {
      await c.run("ROLLBACK");
      throw e;
    }
    return entries.length;
  }

  async close(): Promise<void> {
    if (this.conn) (await this.conn).closeSync();
    this.conn = null;
  }
}

const PER_SESSION: Record<ReportTable, boolean> = { phase_times: true, issues: true, stuck_points: true, action_sequences: false, heatmap: true };

export class BruinReportSource implements ReportSource {
  readonly name = "bruin";
  private conn: Promise<DuckDBConnection> | null = null;
  constructor(readonly path: string) {}

  async read(table: ReportTable, sessionId?: string): Promise<Record<string, unknown>[]> {
    this.conn ??= connect(this.path);
    const c = await this.conn;
    const filtered = PER_SESSION[table] && sessionId !== undefined;
    const reader = await c.runAndReadAll(`SELECT * FROM report.${table}${filtered ? " WHERE session_id = ?" : ""}`, filtered ? [sessionId] : []);
    return reader.getRowObjectsJson() as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    if (this.conn) (await this.conn).closeSync();
    this.conn = null;
  }
}
