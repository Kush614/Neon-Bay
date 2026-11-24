import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load the repo-root .env (API keys stay server-side) when it exists; real env vars win.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
// Agent service: spawns one worker thread per agent.
import { Worker } from "node:worker_threads";
import { DEFAULT_SERVER_PORT } from "@neon-bay/shared";
import { PERSONAS } from "./personas/index.js";

const serverUrl = process.env.GAME_SERVER_URL ?? `http://localhost:${DEFAULT_SERVER_PORT}`;
const ids = (process.env.AGENTS ?? Object.keys(PERSONAS).join(",")).split(",").map((s) => s.trim()).filter(Boolean);

/** `pnpm dev` starts the server and the agents together; wait until the server answers HTTP. */
async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`game server at ${url} did not answer within ${timeoutMs / 1000} s`);
      if (attempt === 0) console.log(`[agents] waiting for the game server at ${url}…`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
await waitForServer(serverUrl);

const workers: Worker[] = [];
for (const personaId of ids) {
  if (!PERSONAS[personaId]) {
    console.error(`[agents] unknown persona "${personaId}"; known: ${Object.keys(PERSONAS).join(", ")}`);
    continue;
  }
  // Workers inherit the tsx loader so they can run TypeScript directly.
  const w = new Worker(new URL("./worker.ts", import.meta.url), {
    workerData: { personaId, serverUrl },
    execArgv: ["--import", "tsx"],
  });
  w.on("error", (e) => console.error(`[agents] ${personaId} crashed:`, e));
  w.on("exit", (code) => console.log(`[agents] ${personaId} exited (${code})`));
  workers.push(w);
}
console.log(`[agents] started ${workers.length} agent worker(s) against ${serverUrl}`);

const shutdown = () => {
  for (const w of workers) w.postMessage("stop");
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
