// In-memory DuckDB only: no MotherDuck, no network.
import type { LedgerEntry } from "@neon-bay/shared";
import { describe, expect, it } from "vitest";
import { createLedgerSink, createReportSource, warehousePath } from "../index.js";
import { BruinLedgerSink, flatten } from "./warehouse.js";

function entry(tick: number, over: Partial<LedgerEntry["row"]> = {}): LedgerEntry {
  return {
    row: {
      sessionId: "s1", tick, timestamp: "2026-11-23T12:00:00.000Z", phase: "heist", actorId: "a1", actorName: "Dex", actorKind: "agent",
      persona: "exploiter", action: { type: "wait" }, reason: "hold", position: { x: 1, y: 0, z: 2 }, trustChanges: {}, issue: null,
      harness: "stub", latencyMs: 3, ...over,
    },
    ok: true, result: "", citesPastSession: false,
  };
}

describe("Bruin warehouse", () => {
  it("flattens a ledger row with game seconds from the 20 Hz tick", () => {
    const f = flatten(entry(40, { issue: { type: "exploit", severity: "high", description: "free money" } }));
    expect(f.slice(0, 3)).toEqual(["s1", 40, 2]);
    expect(f).toContain("exploit");
    expect(f).toContain("free money");
  });

  it("writes a session into raw.ledger and replaces it on a second push", async () => {
    const sink = new BruinLedgerSink(":memory:");
    expect(await sink.writeSession("s1", [entry(1), entry(2), entry(3)])).toBe(3);
    await sink.writeSession("s1", [entry(1)]);
    await sink.writeSession("s2", [entry(5, { sessionId: "s2" })]);
    const c = await (sink as unknown as { db(): Promise<import("@duckdb/node-api").DuckDBConnection> }).db();
    const rows = (await c.runAndReadAll("SELECT session_id, count(*)::INT n FROM raw.ledger GROUP BY 1 ORDER BY 1")).getRowObjectsJson();
    expect(rows).toEqual([{ session_id: "s1", n: 1 }, { session_id: "s2", n: 1 }]);
    await sink.close();
  });

  it("selects Bruin only with LEDGER_SINK=bruin, and MotherDuck only with a token", () => {
    expect(createLedgerSink({}, "/repo").name).toBe("stub");
    expect(createLedgerSink({ LEDGER_SINK: "bruin" }, "/repo").name).toBe("bruin");
    expect(createLedgerSink({ LEDGER_SINK: "bruin", BRUIN_WAREHOUSE: "md:neon_bay" }, "/repo", () => {}).name).toBe("stub");
    expect(createReportSource({}, "/repo").name).toBe("stub");
    expect(warehousePath({}, "/repo/")).toBe("/repo/data/warehouse.duckdb");
    expect(warehousePath({ BRUIN_WAREHOUSE: "md:neon_bay" }, "/repo")).toBe("md:neon_bay");
  });
});
