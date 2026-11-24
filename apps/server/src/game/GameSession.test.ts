import { describe, expect, it } from "vitest";
import { CARS, MSG } from "@neon-bay/shared";
import { STUB_HEADLINES } from "@neon-bay/integrations";
import { createHeadlessSession } from "../headless.js";

const DT = 1 / 60;

async function makeSession() {
  const sent: { to: string; type: string; payload: unknown }[] = [];
  const h = await createHeadlessSession({
    sessionId: "test-session",
    ledger: false,
    phases: { minHumans: 1 },
    output: { toPlayer: (to, type, payload) => sent.push({ to, type, payload }), broadcast: (type, payload) => sent.push({ to: "*", type, payload }) },
  });
  return { ...h, sent };
}

describe("GameSession", () => {
  it("leaves the lobby when enough humans are ready and announces the phase", async () => {
    const { session, close, sent } = await makeSession();
    session.addPlayer("h1", { kind: "human", name: "Ana" });
    session.addPlayer("a1", { kind: "agent", name: "Rico", role: "driver", persona: "speedrunner" });
    session.tick(3, DT);
    expect(session.phase).toBe("lobby");
    session.setReady("h1", true);
    session.tick(3, DT);
    expect(session.phase).toBe("plan");
    expect(sent).toContainEqual({ to: "*", type: MSG.world, payload: { type: "phase", phase: "plan", seconds: 90 } });
    close();
  });

  it("plays stub radio headlines once the session starts, and none in the lobby", async () => {
    const { session, close, sent } = await makeSession();
    const radio = () => sent.filter((m) => m.type === MSG.world && (m.payload as { type: string }).type === "radio");
    session.addPlayer("h1", { kind: "human", name: "Ana" });
    await Promise.resolve();
    session.tick(120, DT);
    expect(radio()).toHaveLength(0);
    session.setReady("h1", true);
    session.tick(60 * 50, DT);
    expect(radio().map((m) => (m.payload as { headline: string }).headline)).toEqual([STUB_HEADLINES[0], STUB_HEADLINES[1]]);
    close();
  });

  it("lets a human get into a car, drive it with throttle input, and get out", async () => {
    const { session, close } = await makeSession();
    const car = CARS[0]!;
    session.addPlayer("h1", { kind: "human" });
    session.sim.teleport("h1", { x: car.spawn.x - 2.6, z: car.spawn.z });
    session.tick(3, DT);
    expect(session.toggleVehicle("h1")).toBeNull();
    expect(session.playerView("h1")!.vehicleId).toBe(car.id);
    expect(session.playerView("h1")!.animation).toBe("drive");
    const start = session.sim.vehicles.get(car.id)!.position();
    for (let i = 0; i < 40; i++) {
      expect(session.input("h1", { seq: i + 1, x: 0, z: 0, run: false, throttle: 1, steer: 0 })).toBeNull();
      session.tick(3, DT);
    }
    const end = session.sim.vehicles.get(car.id)!.position();
    // Heading is pi (toward -z), so full throttle drives south.
    expect(start.z - end.z).toBeGreaterThan(8);
    expect(session.toggleVehicle("h1")).toBeNull();
    expect(session.playerView("h1")!.vehicleId).toBeNull();
    // Far from any car now? Then the toggle is rejected with a reason.
    session.sim.teleport("h1", { x: 5, z: 30 });
    session.tick(3, DT);
    expect(session.toggleVehicle("h1")?.reason).toMatch(/no free car/);
    close();
  });

  it("rejects malformed actions with a reason and records nothing", async () => {
    const { session, close } = await makeSession();
    session.addPlayer("h1", { kind: "human" });
    const r = session.submit("h1", { action: { type: "teleport" } });
    expect(r).toMatchObject({ action: "invalid", ok: false });
    close();
  });
});

describe("GameSession police", () => {
  it("a cop arrests a crew member walking away, who drops their bag", async () => {
    const { session, close, sent } = await makeSession();
    session.addPlayer("cop", { kind: "agent", name: "Vega", role: "cop" });
    session.addPlayer("dex", { kind: "agent", name: "Dex", role: "muscle" });
    session.sim.teleport("cop", { x: 4, z: 0 });
    session.sim.teleport("dex", { x: 4, z: 6 });
    session.tick(3, DT);
    session.state.alarm = true;
    session.state.players.get("dex")!.carryingBag = true;
    session.sim.setCarryingBag("dex", true); // a bag slows the carrier to 80%
    expect(session.submit("dex", { type: "move_to", target: { x: 4, y: 0, z: 120 } }).ok).toBe(true);
    expect(session.submit("cop", { type: "arrest", target: "dex" }).ok).toBe(true);
    let t = 0;
    while (!session.state.players.get("dex")!.arrested && t < 12) {
      session.tick(3, DT);
      t += 3 * DT;
    }
    expect(session.state.players.get("dex")!.arrested).toBe(true);
    expect(session.state.droppedBags).toHaveLength(1);
    expect(session.playerView("dex")!.animation).toBe("hands_up");
    expect(sent.some((m) => m.type === MSG.world && (m.payload as { type: string }).type === "arrest")).toBe(true);
    // Arrested players cannot act until released.
    expect(session.submit("dex", { type: "move_to", target: "marina" }).reason).toMatch(/arrested/);
    close();
  });
});
