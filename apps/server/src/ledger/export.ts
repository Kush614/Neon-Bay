// pnpm ledger:export -- --session <id>   Writes a session's ledger from SQLite as JSONL.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ledgerJsonlPath } from "./paths.js";
import { listSessions, openDb, readSession } from "./sqlite.js";

// `pnpm ledger:export -- --session x` forwards a literal "--"; drop it so the flags parse.
const args = process.argv.slice(2).filter((a) => a !== "--");
const { values } = parseArgs({ args, options: { session: { type: "string" }, out: { type: "string" } }, allowPositionals: true });
const db = openDb();
if (!values.session) {
  const sessions = listSessions(db);
  console.error("Usage: pnpm ledger:export -- --session <id> [--out <file>]\n\nSessions:");
  for (const s of sessions.slice(0, 20)) console.error(`  ${s.sessionId}  ${s.rows} rows  ${s.first}`);
  process.exit(1);
}
const entries = readSession(db, values.session);
if (entries.length === 0) {
  console.error(`No ledger rows for session ${values.session}`);
  process.exit(1);
}
const out = values.out ?? ledgerJsonlPath(values.session);
writeFileSync(out, entries.map((e) => JSON.stringify(e.row)).join("\n") + "\n");
console.log(`Wrote ${entries.length} rows to ${out}`);
