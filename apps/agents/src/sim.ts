// pnpm sim -- --seed <n> [--verbose]: run one full headless session and print scores and issues.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createCrewChannel, createLedgerSink, createNewsFeed } from "@neon-bay/integrations";
import { runSim } from "./sim/runSim.js";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { seed: { type: "string", default: "1" }, verbose: { type: "boolean", short: "v", default: false } },
});
const seed = Number(values.seed);
if (!Number.isInteger(seed)) {
  console.error("--seed must be an integer");
  process.exit(2);
}

const crewChannel = createCrewChannel(process.env, values.verbose ? (l) => console.log(l) : undefined);
const newsFeed = createNewsFeed(process.env);
const ledgerSink = createLedgerSink(process.env, fileURLToPath(new URL("../../../", import.meta.url)), (l) => console.warn(l));
const r = await runSim({ seed, log: values.verbose ? (l) => console.log(l) : undefined, crewChannel, newsFeed, ledgerSink });
await crewChannel.close();
if (crewChannel.name !== "stub") console.log(`crew channel: ${crewChannel.name}`);
if (newsFeed.name !== "stub") console.log(`news feed: ${newsFeed.name}`);
if (ledgerSink.name !== "stub") console.log(`ledger pushed to the Bruin warehouse (${(ledgerSink as { path?: string }).path ?? ""})`);
await ledgerSink.close();
const money = (n: number) => n.toLocaleString("en-US");
console.log(`\nNeon Bay '86 headless sim, seed ${seed}`);
console.log(`session ${r.sessionId}: ${r.completed ? "completed" : "DID NOT COMPLETE"} (${r.phases.join(" > ")})`);
console.log(`${r.simulatedSeconds.toFixed(0)} s simulated in ${(r.wallMs / 1000).toFixed(1)} s; ${r.decisions} decisions, ${r.ledgerRows} ledger rows, ${r.bagsBanked} bags banked\n`);
console.table(r.scores.map((s) => ({ player: s.name, role: s.role, score: money(s.score), clean: money(s.cleanCash), dirty: money(s.dirtyCash) })));
console.log(`issues reported: ${r.issues.length}`);
for (const e of r.issues) console.log(`  [${e.row.issue!.severity}] ${e.row.actorName} (${e.row.issue!.type}): ${e.row.issue!.description}`);
process.exit(r.completed ? 0 : 1);
