import type { PersonaDef } from "../personas/types.js";
import { mulberry32 } from "../runtime/rng.js";
import { AnthropicLlmClient } from "./AnthropicLlmClient.js";
import type { LlmClient } from "./LlmClient.js";
import { StubLlmClient } from "./StubLlmClient.js";

export type { LlmClient } from "./LlmClient.js";
export { StubLlmClient } from "./StubLlmClient.js";

/** A stub client that plays the persona's stub policy against each observation. */
export function personaStub(persona: PersonaDef, seed = 1): StubLlmClient {
  const ctx = { rng: mulberry32(seed * 7919 + persona.id.length * 131 + persona.id.charCodeAt(0)), memo: {} };
  // The observation is one line of JSON; a retry appends a note after a blank line.
  return new StubLlmClient([({ observation }) => persona.stub(JSON.parse(observation.split("\n\n")[0]!), ctx)]);
}

/**
 * Select the model provider from LLM_PROVIDER:
 * - "stub" (default): deterministic persona policies, no network, used by every test.
 * - "anthropic": Claude via the Anthropic SDK. LLM_MODEL overrides the model, LLM_EFFORT the effort.
 */
export function createLlmClient(persona: PersonaDef, env: NodeJS.ProcessEnv = process.env, opts: { seed?: number } = {}): LlmClient {
  const provider = (env.LLM_PROVIDER ?? "stub").toLowerCase();
  switch (provider) {
    case "stub":
      return personaStub(persona, opts.seed);
    case "anthropic": {
      const effort = env.LLM_EFFORT as "low" | "medium" | "high" | undefined;
      return new AnthropicLlmClient({ model: env.LLM_MODEL || undefined, effort: effort || undefined });
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Supported: stub, anthropic`);
  }
}
