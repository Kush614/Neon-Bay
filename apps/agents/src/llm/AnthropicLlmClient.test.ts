// Checks the request shape and reply handling against a fake fetch. Never calls a real model.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicLlmClient } from "./AnthropicLlmClient.js";

function fakeClient(body: object, seen: { url?: string; body?: Record<string, unknown>; headers?: Headers }[]) {
  return new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (url, init) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
}

const message = (content: object[], stop_reason = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content,
  stop_reason,
  stop_details: stop_reason === "refusal" ? { type: "refusal", category: "cyber", explanation: "" } : null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe("AnthropicLlmClient", () => {
  it("sends the cached persona prompt and observation, and returns the reply text", async () => {
    const seen: Parameters<typeof fakeClient>[1] = [];
    const reply = '{"action":{"type":"wait"},"reason":"r","say":null,"trustChanges":{}}';
    const llm = new AnthropicLlmClient({ client: fakeClient(message([{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: reply }]), seen) });
    expect(await llm.decide("SYSTEM", '{"phase":"plan"}')).toBe(reply);
    expect(llm.harness).toBe("anthropic:claude-opus-5-5");
    const req = seen[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.body).toMatchObject({
      model: "claude-opus-5-5",
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: '{"phase":"plan"}' }],
      output_config: { effort: "low" },
      fallbacks: "default",
    });
    expect(req.headers?.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("throws on a refusal so the agent retries, then falls back to wait", async () => {
    const llm = new AnthropicLlmClient({ client: fakeClient(message([], "refusal"), []) });
    await expect(llm.decide("S", "{}")).rejects.toThrow(/declined: cyber/);
  });
});
