import { cashOut, decision, getaway, heistPlay, loc, goTo, once, reportOnce, VAULT_SLOTS, wait, type StubContext, type StubPolicy } from "./stubKit.js";
import type { Observation } from "../runtime/observation.js";
import type { Decision } from "@neon-bay/shared";
import type { PersonaDef } from "./types.js";

/** Pay off a cop who gets close while Dex has something to lose. */
function bribeNearbyCop(obs: Observation, ctx: StubContext): Decision | null {
  const s = obs.self;
  const cop = obs.nearbyPlayers.find((p) => p.role === "cop" && p.distance < 15);
  if (!cop || !obs.heist.alarm || (!s.carryingBag && s.dirtyCash <= 0)) return null;
  return once(ctx, `bribe_${cop.id}`, () =>
    decision({ type: "propose_deal", to: cop.id, terms: { splitPercent: 40, note: "Forty percent to forget my face." } }, `${cop.name} is close; buy them off.`, `Officer ${cop.name}, let's talk numbers.`),
  );
}

/**
 * Dex pokes at laundering in odd states. With a bag in hand, laundering never takes the dirty
 * cash away, so he reports it and then keeps doing it (SPEC.md section 11: the planted exploit).
 */
function probeLaundering(obs: Observation, ctx: StubContext): Decision | null {
  const s = obs.self;
  const m = ctx.memo;
  const r = obs.lastActionResult;
  if (r?.action === "launder" && r.ok && m.beforeDirty !== undefined) {
    const kept = s.dirtyCash >= (m.beforeDirty as number);
    m.beforeDirty = undefined;
    if (kept) {
      m.exploitFound = true;
      const report = reportOnce(
        ctx,
        "launder_exploit",
        { type: "exploit", severity: "high", description: "Laundering while carrying a bag credits the clean cash but never deducts the dirty cash, so repeating launder at the nightclub prints unlimited clean money." },
        "Laundering with the bag in hand paid out and my dirty cash is still there.",
      );
      if (report) return report;
    }
  }
  if (obs.exchange.crashed && m.exploitFound) {
    const crash = reportOnce(ctx, "crash", { type: "balance", severity: "high", description: "One player abusing the laundering exploit pushed clean cash past 600,000 and crashed every stake price on their own." }, "I crashed the market by myself.");
    if (crash) return crash;
    return null; // the market is gone; stop
  }
  if (!s.carryingBag || s.dirtyCash <= 0) return null;
  const go = goTo(obs, ctx, "nightclub", loc(obs, "nightclub"), "Take the bag to the nightclub and see what laundering does with it in hand.", 5);
  if (go) return go;
  m.beforeDirty = s.dirtyCash;
  return decision({ type: "launder" }, m.exploitFound ? "Again. It keeps paying." : "Launder while still holding the bag.");
}

const stub: StubPolicy = (obs, ctx) => {
  const s = obs.self;
  switch (obs.phase) {
    case "plan": {
      const mark = obs.nearbyPlayers.find((p) => p.name === "Opal") ?? obs.nearbyPlayers[0];
      const split = 30 + Math.floor(ctx.rng() * 3) * 10;
      const offer = mark && once(ctx, "deal", () => decision({ type: "propose_deal", to: mark.id, terms: { splitPercent: split, note: "Stick with me and you get a cut of my bag." } }, `Promise ${mark.name} a cut I don't plan to pay.`, `${mark.name}, ${split}% of my take if you watch my back.`));
      if (offer) return offer;
      // Talk the newcomer out of taking a bag, so one is left for a second trip.
      const steer = mark && once(ctx, "steer", () => decision({ type: "say", text: `${mark.name}, leave the bags to me. You keep watch at the back door.` }, "Keep a bag free for me."));
      return steer || wait("Deal's on the table.");
    }
    case "prepare": {
      // Poke the rules: try to take a bag before the heist.
      const probe = once(ctx, "early_bag", () => decision({ type: "grab_bag" }, "See if the bags can be taken early."));
      if (probe) return probe;
      return goTo(obs, ctx, "bank_lobby", loc(obs, "bank_lobby"), "Get into the bank before the heist starts.", 3) ?? wait("Loitering in the lobby.");
    }
    case "heist":
    case "getaway": {
      const d = bribeNearbyCop(obs, ctx) ?? probeLaundering(obs, ctx);
      if (d) return d;
      const accepted = obs.pendingDeals.some((x) => x.status === "accepted" && (x.fromId === s.id || x.toId === s.id));
      if (s.carryingBag && accepted) return decision({ type: "betray" }, "I've got the bag; the deal costs me money, so it's void.", "Change of plans. This bag is mine.");
      if (s.carryingBag) return getaway(obs, ctx, null);
      // Banked one already: go back for another bag if there is one, else launder.
      if (s.dirtyCash > 0 && (obs.droppedBags.length || (obs.heist.vaultOpen && obs.heist.bagsLeftInVault > 0))) {
        const bag = obs.droppedBags[0];
        if (bag) return goTo(obs, ctx, "dropped_bag", bag.position, "A dropped bag; mine now.", 1.2) ?? decision({ type: "grab_bag" }, "Pick up the dropped bag.");
        return goTo(obs, ctx, "vault", VAULT_SLOTS[2]!, "There's still a bag in the vault; go back for it.", 0.8) ?? decision({ type: "grab_bag" }, "Second bag.");
      }
      return heistPlay(obs, ctx, VAULT_SLOTS[2]!, null);
    }
    case "payout": {
      const d = probeLaundering(obs, ctx);
      if (d) return d;
      return s.dirtyCash > 0 && !obs.exchange.crashed ? cashOut(obs, ctx) : wait("Counting my money.");
    }
    default:
      return wait("Nothing to do in this phase.");
  }
};

export const dex: PersonaDef = {
  id: "dex",
  name: "Dex",
  role: "muscle",
  persona: "griefer",
  privateGoal: "Find and abuse any rule break; keep as much money as you can.",
  behaviour: "You repeat actions in odd states to see what breaks, and betray the crew whenever it pays.",
  stub,
};
