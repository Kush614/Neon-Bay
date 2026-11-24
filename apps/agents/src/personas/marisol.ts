import { LOCATION_IDS } from "@neon-bay/shared";
import { decision, goTo, heistPlay, lastFailed, loc, once, reportOnce, VAULT_SLOTS, wait, type StubPolicy } from "./stubKit.js";
import type { PersonaDef } from "./types.js";

const stub: StubPolicy = (obs, ctx) => {
  const m = ctx.memo;
  if (lastFailed(obs) && obs.lastActionResult?.action === "move_to") {
    const r = reportOnce(ctx, `stuck_${obs.lastActionResult.reason}`, { type: "stuck", severity: "medium", description: `move_to failed near ${obs.self.nearestLocation}: ${obs.lastActionResult.reason}` }, "I couldn't get somewhere I should be able to reach.");
    if (r) return r;
  }
  switch (obs.phase) {
    case "plan":
      return (
        once(ctx, "hello", () => decision({ type: "say", text: "I'll take the vault panel. Give me twenty seconds." }, "Tell the crew I'm on the vault.")) ??
        wait("Waiting for prepare to explore.")
      );
    case "prepare": {
      // Try an action from the list before it should matter, and report what happens.
      const tried = once(ctx, "try_launder", () => decision({ type: "launder" }, "Trying launder at the nightclub to see what it does."));
      if (tried) return tried;
      if (obs.lastActionResult?.action === "launder" && !obs.lastActionResult.ok) {
        const r = reportOnce(ctx, "launder", { type: "confusing", severity: "low", description: `launder is in the action list but was rejected: ${obs.lastActionResult.reason}` }, "An advertised action did nothing.");
        if (r) return r;
      }
      // Wander through every location in a seeded order, the bank last.
      const route = (m.route ??= [...LOCATION_IDS].filter((id) => id !== "bank").sort(() => ctx.rng() - 0.5)) as string[];
      while (route.length) {
        const g = goTo(obs, ctx, route[0]!, loc(obs, route[0]!), `Exploring: ${route[0]}.`, 3);
        if (g) return g;
        route.shift();
      }
      return goTo(obs, ctx, "bank", loc(obs, "bank"), "Seen everything; to the bank.") ?? wait("At the bank.");
    }
    case "heist":
    case "getaway":
      return heistPlay(obs, ctx, VAULT_SLOTS[0]!, null);
    default:
      return wait("Nothing to do in this phase.");
  }
};

export const marisol: PersonaDef = {
  id: "marisol",
  name: "Marisol",
  role: "hacker",
  persona: "explorer",
  privateGoal: "Visit every location and try every action at least once.",
  behaviour: "You wander during prepare, poke at everything, and report unreachable or dead areas.",
  stub,
};
