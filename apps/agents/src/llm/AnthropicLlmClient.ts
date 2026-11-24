// Default model provider (LLM_PROVIDER=anthropic). Server-side only: the agent service reads
// ANTHROPIC_API_KEY (or an `ant auth login` profile) from its own environment.
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "./LlmClient.js";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export interface AnthropicLlmOptions {
  model?: string;
  /** Agents decide every 4 s, so low effort keeps replies inside the 6 s budget. */
  effort?: "low" | "medium" | "high";
  /** Injected in tests; defaults to a client that reads credentials from the environment. */
  client?: Anthropic;
}

export class AnthropicLlmClient implements LlmClient {
  readonly harness: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: "low" | "medium" | "high";

  constructor(opts: AnthropicLlmOptions = {}) {
    this.model = opts.model ?? DEFAULT_ANTHROPIC_MODEL;
    this.effort = opts.effort ?? "low";
    this.client = opts.client ?? new Anthropic({ timeout: 15_000, maxRetries: 1 });
    this.harness = `anthropic:${this.model}`;
  }

  async decide(system: string, observation: string): Promise<string> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      // The persona prompt is the same on every call; cache it.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: observation }],
      output_config: { effort: this.effort },
      // On a policy decline, the API re-runs the request on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`model declined: ${response.stop_details?.category ?? "no category"}`);
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (!text) throw new Error(`empty reply (stop_reason ${response.stop_reason})`);
    return text;
  }
}
