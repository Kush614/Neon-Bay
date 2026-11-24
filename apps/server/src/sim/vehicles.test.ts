import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { CAR_MAX_SPEED, CARS, LOCATIONS } from "@neon-bay/shared";
import { Simulation } from "./Simulation.js";
import { roadRoute } from "./vehicles.js";

const DT = 1 / 60;
beforeAll(async () => {
  await RAPIER.init();
});

describe("vehicles", () => {
  it("routes along roads between the car park and the bank", () => {
    const route = roadRoute(LOCATIONS.car_park.entrance, LOCATIONS.bank.entrance);
    expect(route.length).toBeGreaterThan(2);
    expect(route[0]!.id).toBe("98,0");
    expect(route[route.length - 1]!.id).toBe("4,-50");
  });

  it("drives by autopilot from the car park to the bank and the driver rides along", () => {
    const sim = new Simulation(RAPIER);
    const car = CARS[0]!;
    sim.addPlayer("rico", { x: car.spawn.x - 2.6, z: car.spawn.z });
    for (let i = 0; i < 10; i++) sim.step(DT);
    const v = sim.nearestFreeVehicle("rico");
    expect(v?.id).toBe(car.id);
    expect(sim.enterVehicle("rico", v!.id)).toBe(true);
    const route = roadRoute(v!.position(), LOCATIONS.bank.entrance).map((n) => ({ x: n.x, z: n.z }));
    sim.setVehicleRoute("rico", route, "bank");
    let arrived = false;
    let maxSpeed = 0;
    for (let i = 0; i < 60 * 40 && !arrived; i++) {
      sim.step(DT);
      maxSpeed = Math.max(maxSpeed, Math.abs(v!.speed));
      arrived = sim.drainEvents().some((e) => e.id === "rico" && e.event.type === "arrived");
    }
    expect(arrived).toBe(true);
    expect(maxSpeed).toBeLessThanOrEqual(CAR_MAX_SPEED);
    const p = sim.snapshot("rico")!;
    expect(p.vehicleId).toBe(car.id);
    expect(Math.hypot(p.position.x - 4, p.position.z + 50)).toBeLessThan(6);

    expect(sim.exitVehicle("rico")).toBe(true);
    for (let i = 0; i < 10; i++) sim.step(DT);
    const out = sim.snapshot("rico")!;
    expect(out.vehicleId).toBeNull();
    expect(out.position.y).toBeGreaterThan(-0.1);
    sim.dispose();
  });

  it("only lets one driver into a car and refuses cars out of reach", () => {
    const sim = new Simulation(RAPIER);
    const car = CARS[1]!;
    sim.addPlayer("a", { x: car.spawn.x - 2.6, z: car.spawn.z });
    sim.addPlayer("b", { x: car.spawn.x - 2.6, z: car.spawn.z + 1.5 });
    sim.addPlayer("far", LOCATIONS.nightclub.entrance);
    for (let i = 0; i < 10; i++) sim.step(DT);
    expect(sim.enterVehicle("a", car.id)).toBe(true);
    expect(sim.enterVehicle("b", car.id)).toBe(false);
    expect(sim.nearestFreeVehicle("far")).toBeNull();
    sim.dispose();
  });
});
