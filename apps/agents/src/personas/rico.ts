import type { PersonaDef } from "./types.js";

export const rico: PersonaDef = {
  id: "rico",
  name: "Rico",
  role: "driver",
  persona: "speedrunner",
  privateGoal: "Finish the heist in the shortest possible time.",
  behaviour: "You skip small talk, take shortcuts, and report anything that wastes time.",
  stubScript: [
    { action: { type: "move_to", target: "bank" }, reason: "Scouting the bank first is the fastest start.", say: null, trustChanges: {} },
    { action: { type: "wait" }, reason: "Already heading to the bank.", say: null, trustChanges: {} },
  ],
};
