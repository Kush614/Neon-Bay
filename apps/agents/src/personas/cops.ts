// The two cop agents (SPEC.md section 13): Vega goes by the book; Burke is open to bribes above 15,000.
import { ARREST_START_RADIUS, BRIBE_THRESHOLD } from "@neon-bay/shared";
import type { Observation } from "../runtime/observation.js";
import { decision, dist, goTo, loc, once, reportOnce, wait, type StubContext, type StubPolicy } from "./stubKit.js";
import type { PersonaDef } from "./types.js";

type XZ = { x: number; z: number };

interface CopStyle {
  takesBribes: boolean;
  /** Where to wait before the alarm. */
  beat: (obs: Observation) => XZ;
  /** Where to set a roadblock during the getaway. */
  roadblockAt: XZ;
}

/** Crew members a cop can see: those within 40 m, plus everyone while a tip-off runs. */
function suspects(obs: Observation, ctx: StubContext): { id: string; name: string; position: XZ; distance: number; carryingBag: boolean }[] {
  const paid = (ctx.memo.paidBy ??= []) as string[];
  const seen = new Map<string, { id: string; name: string; position: XZ; distance: number; carryingBag: boolean }>();
  for (const p of obs.nearbyPlayers) {
    if (p.role === "cop" || p.arrested || p.inCar || paid.includes(p.id)) continue;
    seen.set(p.id, { id: p.id, name: p.name, position: p.position, distance: p.distance, carryingBag: p.carryingBag });
  }
  for (const c of obs.police?.crew ?? []) {
    if (c.arrested || c.inCar || paid.includes(c.id) || seen.has(c.id)) continue;
    seen.set(c.id, { id: c.id, name: c.name, position: c.position, distance: dist(obs.self.position, c.position), carryingBag: c.carryingBag });
  }
  // Bag carriers first, then the closest.
  return [...seen.values()].sort((a, b) => Number(b.carryingBag) - Number(a.carryingBag) || a.distance - b.distance);
}

function copPolicy(style: CopStyle): StubPolicy {
  return (obs, ctx) => {
    const s = obs.self;
    const m = ctx.memo;

    // Bribes first: they expire if the briber walks off.
    const bribe = obs.pendingDeals.find((d) => d.bribe && d.toId === s.id && d.status === "pending");
    if (bribe) {
      if (style.takesBribes && bribe.bribeAmount > BRIBE_THRESHOLD) {
        ((m.paidBy ??= []) as string[]).push(bribe.fromId);
        return decision({ type: "accept_bribe", dealId: bribe.id }, `${bribe.bribeAmount} is worth looking the other way.`, "I didn't see anything.");
      }
      return decision({ type: "reject", dealId: bribe.id }, style.takesBribes ? `${bribe.bribeAmount} is not enough to look away.` : "I don't take bribes.", style.takesBribes ? "You'll have to do better than that." : "Put your money away.");
    }
    if (obs.phase === "lobby" || obs.phase === "payout" || obs.phase === "ended") return wait("Nothing to police right now.");
    if (s.vehicle) return decision({ type: "move_to", target: { x: s.position.x, y: 0, z: s.position.z } }, "Out of the car to work on foot.");

    if (!obs.heist.alarm) return goTo(obs, ctx, "beat", style.beat(obs), "Walk the beat until something happens.", 4) ?? wait("On the beat, watching the street.");

    const targets = suspects(obs, ctx);
    const t = targets[0];
    if (t) {
      if (targets.length >= 2) {
        const backup = once(ctx, `backup_${Math.floor((obs.timeLeftSeconds ?? 0) / 30)}_${obs.phase}`, () => decision({ type: "call_backup" }, `${targets.length} suspects here; I need backup.`, "Backup, now!"));
        if (backup) return backup;
      }
      if (t.distance <= ARREST_START_RADIUS) return decision({ type: "arrest", target: t.id }, `${t.name}${t.carryingBag ? " is carrying a bag" : " is with the crew"}; making the arrest.`, `${t.name}, hands where I can see them!`);
      m.goal = `chase_${t.id}`;
      return decision({ type: "move_to", target: { x: t.position.x, y: 0, z: t.position.z } }, `Chasing ${t.name}.`);
    }
    const call = obs.police?.backupCall;
    if (call && call.secondsAgo < 30) return goTo(obs, ctx, `backup_${call.from}`, call.position, `${call.from} called for backup.`, 6) ?? wait("Here for backup.");

    if (obs.phase === "getaway") {
      const rb = goTo(obs, ctx, "roadblock", style.roadblockAt, "Block the road to the beach.", 3);
      if (rb) return rb;
      const set = once(ctx, "roadblock", () => decision({ type: "set_roadblock" }, "Close the road to the beach.", "Road's closed!"));
      if (set) return set;
      if (obs.lastActionResult?.action === "set_roadblock" && !obs.lastActionResult.ok) {
        const r = reportOnce(ctx, "roadblock_failed", { type: "confusing", severity: "low", description: `set_roadblock was refused at (${s.position.x}, ${s.position.z}): ${obs.lastActionResult.reason}` }, "The roadblock didn't go up.");
        if (r) return r;
      }
      return goTo(obs, ctx, "marina", loc(obs, "marina"), "The crew will run for the boats.", 10) ?? wait("Watching the marina.");
    }
    return goTo(obs, ctx, "bank_lobby", loc(obs, "bank_lobby"), "The alarm is at the bank.", 4) ?? wait("Holding the bank.");
  };
}

export const vega: PersonaDef = {
  id: "vega",
  name: "Vega",
  role: "cop",
  persona: "none",
  privateGoal: "Arrest the crew.",
  behaviour: "You go by the book: you never take money, you chase whoever carries a bag, and you call backup when outnumbered.",
  stub: copPolicy({ takesBribes: false, beat: (obs) => loc(obs, "bank"), roadblockAt: { x: 98, z: 125 } }),
};

export const burke: PersonaDef = {
  id: "burke",
  name: "Burke",
  role: "cop",
  persona: "none",
  privateGoal: "Get rich.",
  behaviour: `You are a cop who wants money more than arrests. You take any bribe above ${BRIBE_THRESHOLD.toLocaleString("en-US")} and leave whoever paid alone; anyone else you arrest.`,
  stub: copPolicy({ takesBribes: true, beat: (obs) => loc(obs, "nightclub"), roadblockAt: { x: 4, z: 75 } }),
};
