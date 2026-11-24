// M4 acceptance: replay 10 actions and find 10 valid ledger rows in SQLite and JSONL.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LedgerRowSchema, MSG, ROOM_NAME, type ActionEnvelope, type LedgerEntry } from "@neon-bay/shared";
import { createGameServer } from "../app.js";
import { ledgerJsonlPath } from "./paths.js";
import { openDb, readSession } from "./sqlite.js";

const dir = mkdtempSync(join(tmpdir(), "neon-bay-ledger-"));
process.env.NEON_BAY_DATA_DIR = dir;
const port = 33000 + Math.floor(Math.random() * 2000);
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer();
  await server.listen(port);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dir, { recursive: true, force: true });
});

const meta = (reason: string) => ({ reason, trustChanges: { someone: 5 }, harness: "stub", latencyMs: 12 });

describe("M4: ledger", () => {
  it("writes one valid row per action to SQLite and JSONL, and streams them to clients", async () => {
    const agent: Room<{ sessionId: string }> = await new Client(`http://localhost:${port}`).joinOrCreate(ROOM_NAME, {
      name: "Marisol",
      kind: "agent",
      role: "hacker",
      persona: "explorer",
    });
    const human = await new Client(`http://localhost:${port}`).joinOrCreate(ROOM_NAME, { name: "Ana" });
    const streamed: LedgerEntry[] = [];
    human.onMessage(MSG.ledger, (entries: LedgerEntry[]) => streamed.push(...entries));
    const results: { ok: boolean }[] = [];
    agent.onMessage(MSG.actionResult, (r) => results.push(r));
    agent.onMessage(MSG.ledger, () => {});
    agent.onMessage(MSG.speech, () => {});
    human.onMessage(MSG.speech, () => {});
    human.onMessage(MSG.actionResult, () => {});
    await new Promise((r) => setTimeout(r, 300));

    const envelopes: ActionEnvelope[] = [
      { action: { type: "move_to", target: "bank" }, meta: meta("Scout the bank.") },
      { action: { type: "say", text: "Anyone near the bank?" }, meta: meta("Find the crew.") },
      { action: { type: "whisper", to: human.sessionId, text: "Psst." }, meta: meta("Private word.") },
      { action: { type: "whisper", to: "nobody", text: "Hello?" }, meta: meta("Testing.") }, // rejected
      { action: { type: "wait" }, meta: meta("Walking.") },
      { action: { type: "move_to", target: { x: 240, y: 0, z: 0 } }, meta: meta("Swim?") }, // rejected: ocean
      { action: { type: "report_issue", issue: { type: "confusing", severity: "low", description: "No sign says where the vault is." } }, meta: meta("Playtest note.") },
      { action: { type: "move_to", target: "marina" }, meta: meta("Explore the marina.") },
      { action: { type: "betray" }, meta: meta("Testing betrayal early.") }, // rejected: not available yet
      { action: { type: "wait" }, meta: meta("Thinking.") },
    ];
    for (const e of envelopes) agent.send(MSG.action, e);
    await expect.poll(() => results.length, { timeout: 5000 }).toBe(10);

    const sessionId = agent.state.sessionId;
    const db = openDb(join(dir, "neon-bay.sqlite"));
    const entries = readSession(db, sessionId);
    db.close();
    expect(entries).toHaveLength(10);
    for (const [i, e] of entries.entries()) {
      expect(LedgerRowSchema.safeParse(e.row).success, `row ${i} valid`).toBe(true);
      expect(e.row.action).toEqual(envelopes[i]!.action);
      expect(e.row.actorName).toBe("Marisol");
      expect(e.row.persona).toBe("explorer");
      expect(e.row.reason).toBe(envelopes[i]!.meta!.reason);
      expect(e.row.harness).toBe("stub");
    }
    expect(entries.map((e) => e.ok)).toEqual([true, true, true, false, true, false, true, true, false, true]);
    expect(entries[6]!.row.issue?.type).toBe("confusing");
    expect(entries[0]!.row.issue).toBeNull();

    const jsonl = readFileSync(ledgerJsonlPath(sessionId), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(jsonl).toHaveLength(10);
    for (const row of jsonl) expect(LedgerRowSchema.safeParse(row).success).toBe(true);

    // Other clients receive the rows live for the Tab panel.
    await expect.poll(() => streamed.length, { timeout: 2000 }).toBe(10);

    // A human's action gets a row with an empty reason and no harness, even if they send metadata.
    human.send(MSG.action, { action: { type: "say", text: "Hi" }, meta: meta("should be ignored") });
    await expect.poll(() => streamed.length, { timeout: 2000 }).toBe(11);
    expect(streamed[10]!.row).toMatchObject({ actorKind: "human", reason: "", harness: null, latencyMs: null });

    await agent.leave();
    await human.leave();
  }, 20_000);
});
