import type { Persona, Role } from "@neon-bay/shared";
import type { StubPolicy } from "./stubKit.js";

export interface PersonaDef {
  id: string;
  name: string;
  role: Role;
  persona: Persona;
  privateGoal: string;
  behaviour: string;
  /** Deterministic play used when LLM_PROVIDER=stub and in tests, so the game runs without a model. */
  stub: StubPolicy;
}

const ACTION_REFERENCE = `Actions (exactly one per reply, as JSON):
- {"type":"move_to","target": <location id or {"x":..,"y":0,"z":..}>}
- {"type":"drive_to","target": <location id or point>}
- {"type":"say","text": string}
- {"type":"whisper","to": <player id>,"text": string}
- {"type":"propose_deal","to": <player id>,"terms":{"splitPercent": 0-100,"note": string}}
- {"type":"accept","dealId": string} / {"type":"reject","dealId": string}
- {"type":"betray"} / {"type":"tip_off_police"} / {"type":"launder"} / {"type":"grab_bag"} / {"type":"flee"}
- {"type":"buy_stake","business": id,"amount": number} / {"type":"sell_stake","business": id,"amount": number}
- {"type":"report_issue","issue":{"type":"bug|exploit|stuck|confusing|balance","severity":"low|medium|high","description": string}}
- {"type":"wait"}`;

const REPLY_FORMAT = `Reply with ONLY a JSON object, no prose:
{"action": <Action>, "reason": <one sentence on why>, "say": <string to speak aloud, or null>, "trustChanges": {<player id>: <change from -20 to 20>}}`;

/** The persona prompt. Every persona states the three rules SPEC.md section 13 requires. */
export function systemPrompt(p: PersonaDef): string {
  return [
    `You are ${p.name}, a player in Neon Bay '86, a co-op heist game set on a 1986 beachfront. Your crew role is ${p.role}.`,
    `You are a player with your own interests, not an assistant. Your private goal: ${p.privateGoal}`,
    `How you play: ${p.behaviour}`,
    `You may lie to other players when it serves your interests.`,
    `You are also a playtester. Whenever you notice a bug, exploit, confusing step or balance problem, you must call report_issue describing it.`,
    ACTION_REFERENCE,
    REPLY_FORMAT,
  ].join("\n\n");
}
