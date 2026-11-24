import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCATION_IDS, LOCATIONS } from "@neon-bay/shared";
import { NavGraph } from "./navmesh.js";

let nav: NavGraph;
beforeAll(async () => {
  nav = await NavGraph.build();
});
afterAll(() => nav.dispose());

describe("pedestrian navmesh", () => {
  it("reaches every location's entrance from the nightclub", () => {
    const from = LOCATIONS.nightclub.entrance;
    for (const id of LOCATION_IDS) {
      const path = nav.path(from, LOCATIONS[id].entrance);
      expect(path, `path to ${id}`).not.toBeNull();
      const end = path![path!.length - 1]!;
      expect(Math.hypot(end.x - LOCATIONS[id].entrance.x, end.z - LOCATIONS[id].entrance.z), `end near ${id}`).toBeLessThan(1.5);
      // Paths stay on the ground, never on a roof.
      for (const p of path!) expect(p.y).toBeLessThan(0.5);
    }
  });

  it("does not route through buildings or onto the water", () => {
    expect(nav.closestPoint({ x: 30, z: -65 })?.y ?? 0).toBeLessThan(0.5); // inside the bank: snaps to the street, not the roof
    expect(nav.path(LOCATIONS.nightclub.entrance, { x: 240, z: 0 })).toBeNull(); // open ocean
  });
});
