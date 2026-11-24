import type { Decision } from "@neon-bay/shared";
import type { LlmClient } from "./LlmClient.js";

export type ScriptedReply = string | Decision | ((call: { system: string; observation: string; index: number }) => string | Decision);

/**
 * Returns scripted replies in order, then repeats the last one. Used by every automated test
 * and by `LLM_PROVIDER=stub`. Records each call so tests can inspect observations.
 */
export class StubLlmClient implements LlmClient {
  readonly harness = "stub";
  readonly calls: { system: string; observation: string }[] = [];

  constructor(private readonly script: ScriptedReply[]) {
    if (script.length === 0) throw new Error("StubLlmClient needs at least one scripted reply");
  }

  async decide(system: string, observation: string): Promise<string> {
    const index = this.calls.length;
    this.calls.push({ system, observation });
    const entry = this.script[Math.min(index, this.script.length - 1)]!;
    const reply = typeof entry === "function" ? entry({ system, observation, index }) : entry;
    return typeof reply === "string" ? reply : JSON.stringify(reply);
  }
}
