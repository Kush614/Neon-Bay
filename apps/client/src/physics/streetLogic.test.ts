import { describe, expect, it } from "vitest";
import { approachSpeed, brakeTarget, knockVelocity, sidestep, STOP_GAP } from "./streetLogic.js";

const north = { x: 0, z: 1 };

describe("brakeTarget", () => {
  it("cruises with a clear road", () => {
    expect(brakeTarget({ x: 0, z: 0 }, north, 10, [{ x: 0, z: -5 }, { x: 5, z: 6 }]).speed).toBe(10);
  });
  it("stops for someone standing in the lane", () => {
    const r = brakeTarget({ x: 0, z: 0 }, north, 10, [{ x: 0.5, z: STOP_GAP - 0.5 }]);
    expect(r.speed).toBe(0);
    expect(r.blockedBy).toBe(0);
  });
  it("slows for someone further ahead", () => {
    const s = brakeTarget({ x: 0, z: 0 }, north, 10, [{ x: 0, z: 10 }]).speed;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(10);
  });
  it("ignores the other lane", () => {
    expect(brakeTarget({ x: 0, z: 0 }, north, 10, [{ x: 4, z: 6 }]).speed).toBe(10);
  });
});

describe("approachSpeed", () => {
  it("brakes faster than it accelerates", () => {
    expect(10 - approachSpeed(10, 0, 0.1)).toBeGreaterThan(approachSpeed(0, 10, 0.1));
  });
  it("never overshoots", () => {
    expect(approachSpeed(9.9, 10, 1)).toBe(10);
  });
});

describe("knockVelocity", () => {
  it("throws a pedestrian along the car's travel when hit at speed", () => {
    const v = knockVelocity({ x: 0, z: 1 }, [{ x: 0, z: 0, vx: 0, vz: 12, radius: 2.3 }]);
    expect(v).not.toBeNull();
    expect(v!.z).toBeGreaterThan(5);
  });
  it("a slow car only nudges (no knock-down)", () => {
    expect(knockVelocity({ x: 0, z: 1 }, [{ x: 0, z: 0, vx: 0, vz: 1, radius: 2.3 }])).toBeNull();
  });
  it("a near miss is a miss", () => {
    expect(knockVelocity({ x: 4, z: 0 }, [{ x: 0, z: 0, vx: 0, vz: 12, radius: 2.3 }])).toBeNull();
  });
});

describe("sidestep", () => {
  it("moves away from a player who is too close", () => {
    const o = sidestep({ x: 0.3, z: 0 }, [{ x: 0, z: 0 }]);
    expect(o.x).toBeGreaterThan(0);
    expect(o.z).toBe(0);
  });
});
