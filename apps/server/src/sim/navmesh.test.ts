import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BANK_DOORS, LOCATION_IDS, LOCATIONS, POINTS_OF_INTEREST } from "@neon-bay/shared";
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

  it("reaches the vault panel through the bank's front door and through the back door from the alley", () => {
    const vault = POINTS_OF_INTEREST.vault_panel;
    for (const from of [LOCATIONS.bank.entrance, POINTS_OF_INTEREST.bank_back_door]) {
      const path = nav.path(from, vault);
      expect(path, `vault from ${JSON.stringify(from)}`).not.toBeNull();
      const end = path![path!.length - 1]!;
      expect(Math.hypot(end.x - vault.x, end.z - vault.z)).toBeLessThan(1);
    }
    // From the street, the route enters through the front door gap.
    const path = nav.path(LOCATIONS.bank.entrance, vault)!;
    const crossing = path.find((p, i) => i > 0 && path[i - 1]!.x <= BANK_DOORS.front.x && p.x >= BANK_DOORS.front.x);
    expect(crossing === undefined || Math.abs(crossing.z - BANK_DOORS.front.z) < 2).toBe(true);
  });

  it("does not route through buildings or onto the water", () => {
    expect(nav.closestPoint({ x: 30, z: 100 })?.y ?? 0).toBeLessThan(0.5); // inside the pawn shop: snaps to the ground, not the roof
    expect(nav.path(LOCATIONS.nightclub.entrance, { x: 240, z: 0 })).toBeNull(); // open ocean
  });
});
