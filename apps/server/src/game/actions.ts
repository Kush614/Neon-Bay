// Action validation and dispatch. Every Action is checked against phase, distance and
// inventory here; a rejected action returns a reason to the sender.
import { LOCATIONS, type Action, type ActionResult, type LocationId } from "@neon-bay/shared";
import { acceptDeal, betray, proposeDeal, rejectDeal } from "../rules/deals.js";
import { grabBag } from "../rules/heist.js";
import { roadRoute } from "../sim/vehicles.js";
import type { GameSession } from "./GameSession.js";

/** A road route is extended to the exact target when it lies this close to the last road node. */
const OFF_ROAD_FINISH = 25;

function result(action: Action, ok: boolean, reason: string): ActionResult {
  return { action: action.type, ok, reason };
}

export function resolveTarget(target: LocationId | { x: number; z: number }): { point: { x: number; z: number }; label: string } {
  if (typeof target === "string") return { point: LOCATIONS[target].entrance, label: target };
  return { point: { x: target.x, z: target.z }, label: `(${target.x.toFixed(0)}, ${target.z.toFixed(0)})` };
}

/** Actions that arrive in M6 (police, laundering, the exchange). */
const LATER: Action["type"][] = ["tip_off_police", "launder", "buy_stake", "sell_stake"];

export function applyAction(session: GameSession, playerId: string, action: Action): ActionResult {
  const state = session.state;
  const player = state.players.get(playerId);
  if (!player) return result(action, false, "player is not in the session");
  if (state.phase === "ended") return result(action, false, "the session has ended");
  if (player.arrested && action.type !== "wait" && action.type !== "say" && action.type !== "report_issue") {
    return result(action, false, "you are arrested and cannot act");
  }
  const sim = session.sim;

  switch (action.type) {
    case "move_to": {
      if (sim.vehicleOf(playerId)) session.exitVehicle(playerId);
      const snap = sim.snapshot(playerId);
      if (!snap) return result(action, false, "player is not in the world");
      const { point, label } = resolveTarget(action.target);
      const path = session.nav.path(snap.position, point);
      if (!path) return result(action, false, `no walkable route to ${label}`);
      sim.setPath(playerId, path, label, true);
      let length = 0;
      let prev = snap.position;
      for (const p of path) {
        length += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
      }
      return result(action, true, `walking to ${label}, ${length.toFixed(0)} m`);
    }
    case "drive_to": {
      if (!sim.vehicleOf(playerId)) {
        const car = sim.nearestFreeVehicle(playerId);
        if (!car) return result(action, false, "no free car within 4 m; cars start at the car_park");
        session.enterVehicle(playerId, car.id);
      }
      const car = sim.vehicleOf(playerId)!;
      const { point, label } = resolveTarget(action.target);
      const nodes = roadRoute(car.position(), point).map((n) => ({ x: n.x, z: n.z }));
      const last = nodes[nodes.length - 1]!;
      if (Math.hypot(last.x - point.x, last.z - point.z) < OFF_ROAD_FINISH) nodes.push(point);
      sim.setVehicleRoute(playerId, nodes, label);
      return result(action, true, `driving ${car.spec.label} to ${label} by road`);
    }
    case "wait":
      return result(action, true, "waiting");
    case "say": {
      const heard = session.speak(playerId, action.text, null);
      return result(action, true, heard === 0 ? "nobody was in earshot" : `heard by ${heard}`);
    }
    case "whisper": {
      if (!state.players.has(action.to)) return result(action, false, `no player with id ${action.to}`);
      if (action.to === playerId) return result(action, false, "you cannot whisper to yourself");
      session.speak(playerId, action.text, action.to);
      return result(action, true, "whispered");
    }
    case "propose_deal": {
      const r = proposeDeal(state, playerId, action.to, action.terms);
      if (r.deal) session.publishDeal(r.deal);
      return result(action, r.ok, r.reason);
    }
    case "accept":
    case "reject": {
      const r = (action.type === "accept" ? acceptDeal : rejectDeal)(state, playerId, action.dealId);
      if (r.deal) session.publishDeal(r.deal);
      return result(action, r.ok, r.reason);
    }
    case "betray": {
      const r = betray(state, playerId);
      for (const d of r.voided) session.publishDeal(d);
      return result(action, r.ok, r.reason);
    }
    case "grab_bag": {
      const snap = sim.snapshot(playerId);
      if (!snap) return result(action, false, "player is not in the world");
      if (snap.vehicleId) return result(action, false, "get out of the car first");
      const r = grabBag(state, player, snap.position);
      if (r.ok) sim.setCarryingBag(playerId, true);
      return result(action, r.ok, r.reason);
    }
    case "flee": {
      // Head for the marina by the quickest means at hand.
      const target = { type: sim.vehicleOf(playerId) ? "drive_to" : "move_to", target: "marina" } as Action;
      const r = applyAction(session, playerId, target);
      return result(action, r.ok, r.ok ? `fleeing: ${r.reason}` : r.reason);
    }
    case "report_issue":
      return result(action, true, "issue recorded");
    default:
      if (LATER.includes(action.type)) return result(action, false, `${action.type} is not available in this build yet`);
      return result(action, false, `unknown action ${(action as Action).type}`);
  }
}
