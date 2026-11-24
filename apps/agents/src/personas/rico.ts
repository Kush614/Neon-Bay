import { decision, heistPlay, lastFailed, reportOnce, VAULT_SLOTS, wait, type StubPolicy } from "./stubKit.js";
import type { PersonaDef } from "./types.js";

/** Rico parks on the cross street behind the bank, close to the back door. */
const PARKING = { x: 54, z: -50 };

const stub: StubPolicy = (obs, ctx) => {
  const s = obs.self;
  const m = ctx.memo;
  switch (obs.phase) {
    case "plan":
      return (
        reportOnce(ctx, "plan_length", { type: "balance", severity: "low", description: "The plan phase runs 90 s even when the crew has nothing left to agree; a driver just stands at the nightclub." }, "Waiting out the plan phase wastes time.") ??
        wait("Nothing to say; waiting for prepare.")
      );
    case "prepare": {
      if (m.parked) return wait("Car is parked behind the bank.");
      if (s.vehicle) {
        if (m.goal === "park" && !lastFailed(obs)) {
          if (!s.moving) {
            m.parked = true;
            return decision({ type: "move_to", target: { x: 53, y: 0, z: -68 } }, "Parked; wait by the back door.");
          }
          return wait("Driving to the bank.");
        }
        m.goal = "park";
        return decision({ type: "drive_to", target: { x: PARKING.x, y: 0, z: PARKING.z } }, "Park behind the bank for a quick exit.");
      }
      const car = obs.nearbyCars[0];
      if (car?.canEnter) {
        m.goal = "park";
        return decision({ type: "drive_to", target: { x: PARKING.x, y: 0, z: PARKING.z } }, "Steal the closest car and park it behind the bank.");
      }
      if (car) {
        m.goal = "car";
        return decision({ type: "move_to", target: { x: car.position.x - 2.4, y: 0, z: car.position.z } }, `Walk up to the ${car.label}.`);
      }
      if (m.goal === "car_park" && s.moving) return wait("On the way to the car park.");
      m.goal = "car_park";
      return decision({ type: "move_to", target: "car_park" }, "Cars are at the car park.");
    }
    case "heist":
    case "getaway":
      return heistPlay(obs, ctx, VAULT_SLOTS[1]!, m.parked ? PARKING : null);
    default:
      return wait("Nothing to do in this phase.");
  }
};

export const rico: PersonaDef = {
  id: "rico",
  name: "Rico",
  role: "driver",
  persona: "speedrunner",
  privateGoal: "Finish the heist in the shortest possible time.",
  behaviour: "You skip small talk, take shortcuts, and report anything that wastes time.",
  stub,
};
