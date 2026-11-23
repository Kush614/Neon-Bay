// M1 acceptance: a player can walk from the nightclub to the marina without
// falling through or leaving the map. Uses the same controller the client runs.
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { addStaticColliders, CharacterBody, type MoveInput } from "./physics.js";
import { LOCATIONS, WORLD_BOUNDS } from "./world.js";

const DT = 1 / 60;

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  addStaticColliders(RAPIER, world);
  world.step(); // build the query pipeline before the first move
  return world;
}

interface Trace {
  minFeetY: number;
  maxFeetY: number;
  outOfBounds: boolean;
  steps: number;
}

/** Steer toward each waypoint in turn. Returns a trace of the walk. */
function walk(
  world: RAPIER.World,
  ch: CharacterBody,
  waypoints: { x: number; z: number }[],
  run: boolean,
  maxSeconds: number,
): Trace & { reached: boolean } {
  const trace: Trace = { minFeetY: Infinity, maxFeetY: -Infinity, outOfBounds: false, steps: 0 };
  let i = 0;
  const maxSteps = Math.ceil(maxSeconds / DT);
  for (; trace.steps < maxSteps && i < waypoints.length; trace.steps++) {
    const target = waypoints[i]!;
    const p = ch.feet();
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    if (Math.hypot(dx, dz) < 1) {
      i++;
      continue;
    }
    const input: MoveInput = { x: dx, z: dz, run };
    ch.step(input, DT);
    world.step();
    const f = ch.feet();
    trace.minFeetY = Math.min(trace.minFeetY, f.y);
    trace.maxFeetY = Math.max(trace.maxFeetY, f.y);
    if (f.x < WORLD_BOUNDS.minX || f.x > WORLD_BOUNDS.maxX || f.z < WORLD_BOUNDS.minZ || f.z > WORLD_BOUNDS.maxZ) {
      trace.outOfBounds = true;
    }
  }
  return { ...trace, reached: i >= waypoints.length };
}

/** Push in one direction for a while and report where the character ended up. */
function push(world: RAPIER.World, ch: CharacterBody, dir: { x: number; z: number }, seconds: number) {
  for (let s = 0; s < seconds / DT; s++) {
    ch.step({ ...dir, run: true }, DT);
    world.step();
  }
  return ch.feet();
}

describe("M1: walkable grey-box world", () => {
  it("walks from the nightclub to the marina without falling or leaving the map", () => {
    const world = makeWorld();
    const club = LOCATIONS.nightclub.entrance;
    const marina = LOCATIONS.marina.center;
    const route = [
      { x: 5, z: 50 }, // up Second Street to the cross street at z = 50
      { x: 100, z: 50 }, // east along the cross street to the avenue
      { x: 140, z: 50 }, // through the park wall opening
      { x: 190, z: 185 }, // across the beach to the foot of the pier
      { x: marina.x, z: marina.z },
    ];
    for (const run of [false, true]) {
      const c = new CharacterBody(RAPIER, world, club);
      const result = walk(world, c, route, run, 180);
      expect(result.reached, `reached marina (run=${run})`).toBe(true);
      expect(result.outOfBounds).toBe(false);
      expect(result.minFeetY).toBeGreaterThan(-0.1);
      expect(result.maxFeetY).toBeLessThan(0.6);
      const end = c.feet();
      expect(Math.hypot(end.x - marina.x, end.z - marina.z)).toBeLessThan(1.5);
      c.dispose();
    }
  });

  it("collides with buildings", () => {
    const world = makeWorld();
    const club = LOCATIONS.nightclub;
    const ch = new CharacterBody(RAPIER, world, club.entrance);
    const end = push(world, ch, { x: 1, z: 0 }, 3);
    expect(end.x).toBeLessThan(club.footprint.minX);
  });

  it("keeps players inside the map and out of the ocean", () => {
    const world = makeWorld();
    const cases: { spawn: { x: number; z: number }; dir: { x: number; z: number }; check: (p: { x: number; z: number }) => boolean }[] = [
      { spawn: { x: 4, z: 0 }, dir: { x: -1, z: 0 }, check: (p) => p.x >= WORLD_BOUNDS.minX },
      { spawn: { x: 120, z: -195 }, dir: { x: 0, z: -1 }, check: (p) => p.z >= WORLD_BOUNDS.minZ },
      { spawn: { x: 120, z: 195 }, dir: { x: 0, z: 1 }, check: (p) => p.z <= WORLD_BOUNDS.maxZ },
      { spawn: { x: 190, z: 0 }, dir: { x: 1, z: 0 }, check: (p) => p.x <= 198 }, // sea wall
      { spawn: { x: 205, z: 185 }, dir: { x: 1, z: 0 }, check: (p) => p.x <= 214 }, // end of the pier
      { spawn: { x: 205, z: 185 }, dir: { x: 0, z: -1 }, check: (p) => p.z >= 178 }, // pier railing
    ];
    for (const c of cases) {
      const ch = new CharacterBody(RAPIER, world, c.spawn);
      const end = push(world, ch, c.dir, 4);
      expect(c.check(end), `blocked from ${JSON.stringify(c.spawn)} heading ${JSON.stringify(c.dir)}; ended at ${JSON.stringify(end)}`).toBe(true);
      expect(end.y).toBeGreaterThan(-0.1);
      ch.dispose();
    }
  });
});
