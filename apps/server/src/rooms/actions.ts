// Action validation and dispatch. Every Action is checked against phase, distance and
// inventory here; rejected actions return a reason to the sender.
import { LOCATIONS, type Action, type ActionResult, type LocationId, type Phase } from "@neon-bay/shared";
import type { NavGraph } from "../sim/navmesh.js";
import type { Simulation } from "../sim/Simulation.js";

export interface ActionContext {
  sim: Simulation;
  nav: NavGraph;
  phase: Phase;
  playerId: string;
  arrested: boolean;
  /** Deliver speech to players in earshot, or to one player for a whisper. Returns how many heard it. */
  speak: (text: string, toId: string | null) => number;
  /** True if a player with this id is in the room. */
  hasPlayer: (id: string) => boolean;
}

function result(action: Action, ok: boolean, reason: string): ActionResult {
  return { action: action.type, ok, reason };
}

function resolveTarget(target: LocationId | { x: number; z: number }): { point: { x: number; z: number }; label: string } {
  if (typeof target === "string") return { point: LOCATIONS[target].entrance, label: target };
  return { point: { x: target.x, z: target.z }, label: `(${target.x.toFixed(0)}, ${target.z.toFixed(0)})` };
}

export function applyAction(ctx: ActionContext, action: Action): ActionResult {
  if (ctx.phase === "ended") return result(action, false, "the session has ended");
  if (ctx.arrested && action.type !== "wait" && action.type !== "say" && action.type !== "report_issue") {
    return result(action, false, "you are arrested and cannot act");
  }

  switch (action.type) {
    case "move_to": {
      const snap = ctx.sim.snapshot(ctx.playerId);
      if (!snap) return result(action, false, "player is not in the world");
      const { point, label } = resolveTarget(action.target);
      const path = ctx.nav.path(snap.position, point);
      if (!path) return result(action, false, `no walkable route to ${label}`);
      ctx.sim.setPath(ctx.playerId, path, label, true);
      let length = 0;
      let prev = snap.position;
      for (const p of path) {
        length += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
      }
      return result(action, true, `walking to ${label}, ${length.toFixed(0)} m`);
    }
    case "wait":
      return result(action, true, "waiting");
    case "say": {
      const heard = ctx.speak(action.text, null);
      return result(action, true, heard === 0 ? "nobody was in earshot" : `heard by ${heard}`);
    }
    case "whisper": {
      if (!ctx.hasPlayer(action.to)) return result(action, false, `no player with id ${action.to}`);
      if (action.to === ctx.playerId) return result(action, false, "you cannot whisper to yourself");
      ctx.speak(action.text, action.to);
      return result(action, true, "whispered");
    }
    case "report_issue":
      return result(action, true, "issue recorded");
    default:
      return result(action, false, `${action.type} is not available yet`);
  }
}
