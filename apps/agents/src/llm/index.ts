import type { PersonaDef } from "../personas/types.js";
import type { LlmClient } from "./LlmClient.js";
import { StubLlmClient } from "./StubLlmClient.js";

export type { LlmClient } from "./LlmClient.js";
export { StubLlmClient } from "./StubLlmClient.js";

/** Select the model provider from LLM_PROVIDER. Defaults to the stub so the game runs offline. */
export function createLlmClient(persona: PersonaDef, env: NodeJS.ProcessEnv = process.env): LlmClient {
  const provider = (env.LLM_PROVIDER ?? "stub").toLowerCase();
  switch (provider) {
    case "stub":
      return new StubLlmClient(persona.stubScript);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Supported: stub`);
  }
}
