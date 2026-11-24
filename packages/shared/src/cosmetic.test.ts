// Client-only cosmetic physics must never change where the predicted player ends up,
// otherwise prediction would drift from the authoritative server.
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { addStaticColliders, CharacterBody, COSMETIC_GROUPS, PREDICTION_QUERY } from "./physics.js";

const DT = 1 / 60;

beforeAll(async () => {
  await RAPIER.init();
});

/** Walk east for 2 s from (5, 0) with a 2 m crate centred at x=8 in the way. */
function walkPastCrate(crateGroups: number | null, query?: number): number {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  addStaticColliders(RAPIER, world);
  const crate = RAPIER.ColliderDesc.cuboid(1, 1, 1).setTranslation(8, 1, 0);
  if (crateGroups !== null) crate.setCollisionGroups(crateGroups);
  world.createCollider(crate);
  world.step();
  const c = new CharacterBody(RAPIER, world, { x: 5, z: 0 }, query);
  for (let i = 0; i < 120; i++) {
    c.step({ x: 1, z: 0, run: false }, DT);
    world.step();
  }
  return c.feet().x;
}

describe("cosmetic collision groups", () => {
  it("a gameplay obstacle blocks the character", () => {
    expect(walkPastCrate(null, PREDICTION_QUERY)).toBeLessThan(7);
  });

  it("a cosmetic prop does not block the predicted character", () => {
    expect(walkPastCrate(COSMETIC_GROUPS, PREDICTION_QUERY)).toBeGreaterThan(9);
  });

  it("without the filter (the server) everything still blocks", () => {
    expect(walkPastCrate(COSMETIC_GROUPS)).toBeLessThan(7);
  });
});
