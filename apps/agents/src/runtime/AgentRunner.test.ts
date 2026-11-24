// M3 acceptance: with the model stubbed to fixed actions, the agent walks from the nightclub to the bank.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "@neon-bay/server/app";
import { LOCATIONS, type Decision } from "@neon-bay/shared";
import { StubLlmClient } from "../llm/StubLlmClient.js";
import { rico } from "../personas/rico.js";
import { AgentRunner } from "./AgentRunner.js";

const port = 31000 + Math.floor(Math.random() * 2000);
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer();
  await server.listen(port);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const moveToBank: Decision = { action: { type: "move_to", target: "bank" }, reason: "Scout the bank.", say: null, trustChanges: {} };
const wait: Decision = { action: { type: "wait" }, reason: "On my way.", say: null, trustChanges: {} };

describe("M3: first agent", () => {
  it("joins, observes, and walks from the nightclub to the bank on a navmesh path", async () => {
    const llm = new StubLlmClient([moveToBank, wait]);
    const runner = new AgentRunner({ persona: rico, llm, serverUrl: `http://localhost:${port}`, log: () => {} });
    await runner.start();

    const start = runner.self()!;
    // Spawned at the nightclub.
    expect(Math.hypot(start.x - LOCATIONS.nightclub.entrance.x, start.z - LOCATIONS.nightclub.entrance.z)).toBeLessThan(8);

    const bank = LOCATIONS.bank.entrance;
    await expect
      .poll(() => {
        const p = runner.self();
        return p ? Math.hypot(p.x - bank.x, p.z - bank.z) : Infinity;
      }, { timeout: 40_000, interval: 250 })
      .toBeLessThan(1.5);

    // The first observation reached the model and described the world.
    const first = JSON.parse(llm.calls[0]!.observation);
    expect(first.self.name).toBe("Rico");
    expect(first.knownLocations.bank).toEqual({ x: bank.x, z: bank.z });
    expect(llm.calls[0]!.system).toContain("report_issue");

    // The server accepted the move and reported arrival.
    await expect.poll(() => runner.decisions.some((d) => d.observation.recentEvents.includes("arrived at bank")), { timeout: 10_000 }).toBe(true);
    const accepted = runner.decisions.find((d) => d.observation.lastActionResult?.action === "move_to");
    expect(accepted?.observation.lastActionResult?.ok).toBe(true);

    await runner.stop();
  }, 60_000);

  it("accumulates trust from decisions and feeds it into the next observation", async () => {
    const distrust: Decision = { action: { type: "wait" }, reason: "Dex voided our deal.", say: null, trustChanges: { Dex: -30 } };
    const llm = new StubLlmClient([distrust, distrust, distrust, wait]);
    const runner = new AgentRunner({ persona: rico, llm, serverUrl: `http://localhost:${port}`, log: () => {} });
    await runner.start();
    // -30 is clamped to -20 per decision: 50 -> 30 -> 10 -> 0, never below 0.
    await expect.poll(() => runner.trust.get("Dex"), { timeout: 30_000 }).toBe(0);
    await expect.poll(() => llm.calls.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(llm.calls[1]!.observation).trust.Dex).toBe(30);
    await runner.stop();
  }, 60_000);
});
