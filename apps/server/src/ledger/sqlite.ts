import Database from "better-sqlite3";
import type { LedgerEntry, LedgerRow } from "@neon-bay/shared";
import { ledgerDbPath } from "./paths.js";

export type Db = Database.Database;

export function openDb(path = ledgerDbPath()): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      phase TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_kind TEXT NOT NULL,
      persona TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
      trust_changes_json TEXT NOT NULL,
      issue_json TEXT,
      harness TEXT,
      latency_ms INTEGER,
      ok INTEGER NOT NULL DEFAULT 1,
      result TEXT NOT NULL DEFAULT '',
      cites_past_session INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ledger_session ON ledger (session_id, id);
  `);
  return db;
}

export function insertEntry(db: Db, e: LedgerEntry): void {
  const r = e.row;
  db.prepare(
    `INSERT INTO ledger (session_id, tick, timestamp, phase, actor_id, actor_name, actor_kind, persona, action_type, action_json,
       reason, x, y, z, trust_changes_json, issue_json, harness, latency_ms, ok, result, cites_past_session)
     VALUES (@sessionId, @tick, @timestamp, @phase, @actorId, @actorName, @actorKind, @persona, @actionType, @actionJson,
       @reason, @x, @y, @z, @trust, @issue, @harness, @latencyMs, @ok, @result, @cites)`,
  ).run({
    sessionId: r.sessionId,
    tick: r.tick,
    timestamp: r.timestamp,
    phase: r.phase,
    actorId: r.actorId,
    actorName: r.actorName,
    actorKind: r.actorKind,
    persona: r.persona,
    actionType: r.action.type,
    actionJson: JSON.stringify(r.action),
    reason: r.reason,
    x: r.position.x,
    y: r.position.y,
    z: r.position.z,
    trust: JSON.stringify(r.trustChanges),
    issue: r.issue ? JSON.stringify(r.issue) : null,
    harness: r.harness,
    latencyMs: r.latencyMs,
    ok: e.ok ? 1 : 0,
    result: e.result,
    cites: e.citesPastSession ? 1 : 0,
  });
}

interface DbRow {
  session_id: string; tick: number; timestamp: string; phase: string; actor_id: string; actor_name: string; actor_kind: string;
  persona: string; action_json: string; reason: string; x: number; y: number; z: number; trust_changes_json: string;
  issue_json: string | null; harness: string | null; latency_ms: number | null; ok: number; result: string; cites_past_session: number;
}

function toEntry(d: DbRow): LedgerEntry {
  const row = {
    sessionId: d.session_id,
    tick: d.tick,
    timestamp: d.timestamp,
    phase: d.phase,
    actorId: d.actor_id,
    actorName: d.actor_name,
    actorKind: d.actor_kind,
    persona: d.persona,
    action: JSON.parse(d.action_json),
    reason: d.reason,
    position: { x: d.x, y: d.y, z: d.z },
    trustChanges: JSON.parse(d.trust_changes_json),
    issue: d.issue_json ? JSON.parse(d.issue_json) : null,
    harness: d.harness,
    latencyMs: d.latency_ms,
  } as LedgerRow;
  return { row, ok: d.ok === 1, result: d.result, citesPastSession: d.cites_past_session === 1 };
}

/** Entries for a session in write order. */
export function readSession(db: Db, sessionId: string): LedgerEntry[] {
  return (db.prepare(`SELECT * FROM ledger WHERE session_id = ? ORDER BY id`).all(sessionId) as DbRow[]).map(toEntry);
}

export function listSessions(db: Db): { sessionId: string; rows: number; first: string; last: string }[] {
  return db
    .prepare(`SELECT session_id AS sessionId, COUNT(*) AS rows, MIN(timestamp) AS first, MAX(timestamp) AS last FROM ledger GROUP BY session_id ORDER BY first DESC`)
    .all() as { sessionId: string; rows: number; first: string; last: string }[];
}
