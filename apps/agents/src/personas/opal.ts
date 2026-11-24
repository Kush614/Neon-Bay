import { acceptOffers, decision, goTo, heistPlay, loc, once, reportOnce, VAULT_SLOTS, wait, type StubPolicy } from "./stubKit.js";
import type { PersonaDef } from "./types.js";

const stub: StubPolicy = (obs, ctx) => {
  const r = obs.lastActionResult;
  if (r && !r.ok) {
    const report = reportOnce(ctx, `confused_${r.action}`, { type: "confusing", severity: "low", description: `I tried ${r.action} and was told "${r.reason}". Nothing told me that beforehand.` }, "I followed the instructions and it didn't work.");
    if (report) return report;
  }
  switch (obs.phase) {
    case "plan":
      return (
        acceptOffers(obs, "Someone offered me a cut; that sounds good.", "Okay, deal!") ??
        once(ctx, "ask", () => decision({ type: "say", text: "Hi! It's my first job. What should I do first?" }, "Ask the crew for help.")) ??
        wait("Waiting for someone to tell me what to do.")
      );
    case "prepare":
      // The phase says "scout the bank", so she goes to the bank.
      return goTo(obs, ctx, "bank_lobby", loc(obs, "bank_lobby"), "Prepare says scout the bank, so I go to the bank.", 3) ?? wait("I'm in the bank. Is this right?");
    case "heist":
    case "getaway":
      return acceptOffers(obs, "Accepting the offer.") ?? heistPlay(obs, ctx, VAULT_SLOTS[3]!, null);
    default:
      return wait("Waiting.");
  }
};

export const opal: PersonaDef = {
  id: "opal",
  name: "Opal",
  role: "fixer",
  persona: "newcomer",
  privateGoal: "Follow instructions literally and finish your first job.",
  behaviour: "You ask for help, do exactly what you're told, and report confusing steps and where you got stuck.",
  stub,
};
