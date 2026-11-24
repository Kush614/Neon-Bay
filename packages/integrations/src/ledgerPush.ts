// pnpm ledger:push [-- --session <id> | --all]: load ledger JSONL files from data/ledger into the
// Bruin warehouse (LEDGER_SINK=bruin; BRUIN_WAREHOUSE picks local DuckDB or MotherDuck).
// The server also pushes each session automatically when it ends.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { LedgerEntry, LedgerRow } from "@neon-bay/shared";
import { createLedgerSink } from "./index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const { values } = parseArgs({ args: process.argv.slice(2).filter((a) => a !== "--"), options: { session: { type: "string" }, all: { type: "boolean", default: false } } });
const dir = `${root}data/ledger`;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort() : [];
const pick = values.session ? files.filter((f) => f === `${values.session}.jsonl`) : values.all ? files : files.slice(-1);
if (pick.length === 0) {
  console.error(values.session ? `No ledger for session ${values.session}` : "No ledger files in data/ledger");
  process.exit(1);
}
const sink = createLedgerSink({ LEDGER_SINK: "bruin", ...process.env }, root, (l) => console.warn(l));
if (sink.name === "stub") process.exit(1);
for (const f of pick) {
  // The JSONL holds plain LedgerRows; ok/result were not recorded there, so treat them as succeeded.
  const entries: LedgerEntry[] = readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean).map((l) => {
    const row = JSON.parse(l) as LedgerRow & Partial<Pick<LedgerEntry, "ok" | "result" | "citesPastSession">>;
    return { row, ok: row.ok ?? true, result: row.result ?? "", citesPastSession: row.citesPastSession ?? false };
  });
  const n = await sink.writeSession(f.replace(/\.jsonl$/, ""), entries);
  console.log(`pushed ${n} rows from ${f}`);
}
await sink.close();
