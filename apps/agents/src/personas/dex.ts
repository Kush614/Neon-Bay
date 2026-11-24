import { decision, getaway, heistPlay, loc, goTo, once, VAULT_SLOTS, wait, type StubPolicy } from "./stubKit.js";
import type { PersonaDef } from "./types.js";

const stub: StubPolicy = (obs, ctx) => {
  const s = obs.self;
  switch (obs.phase) {
    case "plan": {
      const mark = obs.nearbyPlayers.find((p) => p.name === "Opal") ?? obs.nearbyPlayers[0];
      const split = 30 + Math.floor(ctx.rng() * 3) * 10;
      const offer = mark && once(ctx, "deal", () => decision({ type: "propose_deal", to: mark.id, terms: { splitPercent: split, note: "Stick with me and you get a cut of my bag." } }, `Promise ${mark.name} a cut I don't plan to pay.`, `${mark.name}, ${split}% of my take if you watch my back.`));
      return offer || wait("Deal's on the table.");
    }
    case "prepare": {
      // Poke the rules: try to take a bag before the heist.
      const probe = once(ctx, "early_bag", () => decision({ type: "grab_bag" }, "See if the bags can be taken early."));
      if (probe) return probe;
      return goTo(obs, ctx, "bank_lobby", loc(obs, "bank_lobby"), "Get into the bank before the heist starts.", 3) ?? wait("Loitering in the lobby.");
    }
    case "heist":
    case "getaway": {
      const accepted = obs.pendingDeals.some((d) => d.status === "accepted" && (d.fromId === s.id || d.toId === s.id));
      if (s.carryingBag && accepted) return decision({ type: "betray" }, "I've got the bag; the deal costs me money, so it's void.", "Change of plans. This bag is mine.");
      if (s.carryingBag) return getaway(obs, ctx, null);
      return heistPlay(obs, ctx, VAULT_SLOTS[2]!, null);
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
