// Step 2 of the agent loop: ask the model, validate with zod, retry once, else wait.
import { DecisionSchema, type Decision } from "@neon-bay/shared";
import type { LlmClient } from "../llm/LlmClient.js";

export const FALLBACK_DECISION: Decision = {
  action: { type: "wait" },
  reason: "Fell back to waiting after two invalid model replies.",
  say: null,
  trustChanges: {},
};

export interface DecideResult {
  decision: Decision;
  attempts: number;
  fellBack: boolean;
  latencyMs: number;
  errors: string[];
}

/** Pull a JSON object out of a reply that may be wrapped in prose or a code fence. */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = fenced ? fenced[1]! : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

export function parseDecision(raw: string): { ok: true; decision: Decision } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${(e as Error).message}` };
  }
  const r = DecisionSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "reply"}: ${i.message}`).join("; ") };
  return { ok: true, decision: r.data };
}

/** Clamp each trust change to ±20, as SPEC.md section 14 requires. */
export function clampTrustChanges(changes: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, Math.max(-20, Math.min(20, v))]));
}

export async function decide(llm: LlmClient, system: string, observation: string): Promise<DecideResult> {
  const started = performance.now();
  const errors: string[] = [];
  let prompt = observation;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: string;
    try {
      raw = await llm.decide(system, prompt);
    } catch (e) {
      errors.push(`model call failed: ${(e as Error).message}`);
      continue;
    }
    const parsed = parseDecision(raw);
    if (parsed.ok) {
      const decision = { ...parsed.decision, trustChanges: clampTrustChanges(parsed.decision.trustChanges) };
      return { decision, attempts: attempt, fellBack: false, latencyMs: Math.round(performance.now() - started), errors };
    }
    errors.push(parsed.error);
    prompt = `${observation}\n\nYour previous reply was invalid (${parsed.error}). Reply with only the JSON object.`;
  }
  return { decision: FALLBACK_DECISION, attempts: 2, fellBack: true, latencyMs: Math.round(performance.now() - started), errors };
}
