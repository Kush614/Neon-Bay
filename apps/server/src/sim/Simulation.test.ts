import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { BAG_SPEED_FACTOR, LOCATIONS, RUN_SPEED, WALK_SPEED } from "@neon-bay/shared";
import { Simulation } from "./Simulation.js";

const DT = 1 / 60;
beforeAll(async () => {
  await RAPIER.init();
});

/** Open ground on the beach, far from walls, so speed is not limited by collisions. */
const OPEN = { x: 160, z: 0 };

function run(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("Simulation movement authority", () => {
  it("moves at run speed and never faster, even for a diagonal input", () => {
    const sim = new Simulation(RAPIER);
    sim.addPlayer("a", OPEN);
    run(sim, 0.2); // settle onto the ground
    const start = sim.snapshot("a")!.position;
    // Diagonal (1, 1) has length 1.41; the server must clamp it to 1.
    sim.setInput("a", { seq: 1, x: 1, z: 1, run: true });
    run(sim, 2);
    const moved = dist(start, sim.snapshot("a")!.position);
    expect(moved).toBeGreaterThan(RUN_SPEED * 2 * 0.95);
    expect(moved).toBeLessThanOrEqual(RUN_SPEED * 2 * 1.01);
    expect(sim.speedViolations("a")).toBe(0);
    sim.dispose();
  });

  it("walks at walk speed and slows to 80% while carrying a bag", () => {
    const sim = new Simulation(RAPIER);
    sim.addPlayer("a", OPEN);
    sim.addPlayer("b", { x: OPEN.x, z: OPEN.z + 20 });
    sim.setCarryingBag("b", true);
    run(sim, 0.2);
    const a0 = sim.snapshot("a")!.position;
    const b0 = sim.snapshot("b")!.position;
    sim.setInput("a", { seq: 1, x: 1, z: 0, run: false });
    sim.setInput("b", { seq: 1, x: 1, z: 0, run: false });
    run(sim, 2);
    expect(dist(a0, sim.snapshot("a")!.position)).toBeCloseTo(WALK_SPEED * 2, 0);
    expect(dist(b0, sim.snapshot("b")!.position)).toBeCloseTo(WALK_SPEED * 2 * BAG_SPEED_FACTOR, 0);
    sim.dispose();
  });

  it("ignores stale or replayed input", () => {
    const sim = new Simulation(RAPIER);
    sim.addPlayer("a", OPEN);
    expect(sim.setInput("a", { seq: 5, x: 1, z: 0, run: false })).toBe(true);
    expect(sim.setInput("a", { seq: 5, x: -1, z: 0, run: true })).toBe(false);
    expect(sim.setInput("a", { seq: 3, x: -1, z: 0, run: true })).toBe(false);
    expect(sim.snapshot("a")!.lastSeq).toBe(5);
    sim.dispose();
  });

  it("rejects a horizontal move faster than run speed", () => {
    const sim = new Simulation(RAPIER);
    sim.addPlayer("a", OPEN);
    run(sim, 0.2);
    const before = sim.snapshot("a")!.position;
    // Simulate a physics glitch / tampered body: push the body 5 m in one step.
    const body = (sim as unknown as { players: Map<string, { body: { body: RAPIER.RigidBody; step: (i: unknown, dt: number) => void } }> }).players.get("a")!.body;
    const realStep = body.step.bind(body);
    body.step = (i, dt) => {
      realStep(i, dt);
      const t = body.body.translation();
      body.body.setNextKinematicTranslation({ x: t.x + 5, y: t.y, z: t.z });
    };
    sim.step(DT);
    expect(sim.speedViolations("a")).toBe(1);
    expect(dist(before, sim.snapshot("a")!.position)).toBeLessThan(0.01);
    sim.dispose();
  });

  it("collides with buildings on the server", () => {
    const sim = new Simulation(RAPIER);
    sim.addPlayer("a", LOCATIONS.bank.entrance);
    sim.setInput("a", { seq: 1, x: 1, z: 0, run: true });
    run(sim, 3);
    expect(sim.snapshot("a")!.position.x).toBeLessThan(LOCATIONS.bank.footprint.minX);
    sim.dispose();
  });
});
