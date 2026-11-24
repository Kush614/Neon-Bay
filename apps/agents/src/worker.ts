// Worker thread entry: one agent per worker (SPEC.md section 3).
import { parentPort, workerData } from "node:worker_threads";
import { createLlmClient } from "./llm/index.js";
import { PERSONAS } from "./personas/index.js";
import { AgentRunner } from "./runtime/AgentRunner.js";

const { personaId, serverUrl } = workerData as { personaId: string; serverUrl: string };
const persona = PERSONAS[personaId];
if (!persona) throw new Error(`unknown persona ${personaId}`);

const runner = new AgentRunner({ persona, llm: createLlmClient(persona), serverUrl });
await runner.start();
parentPort?.on("message", (m) => {
  if (m === "stop") void runner.stop().then(() => process.exit(0));
});
