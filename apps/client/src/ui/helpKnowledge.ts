// Knowledge base for the in-game helper bot. Answers come from SPEC.md section 11 and the
// controls; matching is keyword scoring, so it runs offline with no API key in the client.
// It deliberately says nothing about the planted laundering exploit (SPEC.md section 11).
import { BAG_VALUE, PHASE_SECONDS, VAULT_BAGS, VAULT_SECONDS_HACKER, VAULT_SECONDS_OTHER } from "@neon-bay/shared";

export interface Topic {
  id: string;
  keys: string[];
  answer: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export const TOPICS: Topic[] = [
  {
    id: "about",
    keys: ["project", "about", "why", "playtest", "playtester", "learn", "learning", "ledger report", "who made"],
    answer: "Neon Bay is a test bench: the AI crew are playtesters with personas (speedrunner, explorer, griefer, newcomer). Every decision they make goes into a ledger with their reason, and they file bug reports themselves. The ledger becomes a playtest report for the studio. The full story, with diagrams, is on the About page: /about.html",
  },
  {
    id: "goal",
    keys: ["goal", "win", "objective", "point", "how to play", "what do i do", "start", "begin", "score", "aim"],
    answer: `You're a crew robbing the Neon Bay bank. Crack the vault, carry bags of dirty cash to the marina, then launder it. Your final score is clean cash plus the value of your stakes at the end of payout. Crewmates are AI agents, and they may cut deals or betray you.`,
  },
  {
    id: "controls",
    keys: ["control", "key", "keys", "move", "walk", "run", "button", "wasd", "mouse", "camera", "look"],
    answer: "WASD moves, Shift runs, and you drag or click the mouse to look (Esc releases it). E gets in or out of a car. G grabs a bag at the open vault. Y/N answers a deal offer. R marks you ready in the lobby. Tab opens the ledger, M the full map, H this helper and K mutes the sound.",
  },
  {
    id: "phases",
    keys: ["phase", "phases", "timer", "time", "round", "stages", "order", "lobby", "plan", "prepare", "getaway", "payout"],
    answer: `Phases: lobby (until 2 humans press R) → plan ${PHASE_SECONDS.plan}s (meet at the nightclub, agree roles and split) → prepare ${PHASE_SECONDS.prepare}s (steal a car, buy stakes, scout the bank) → heist ${PHASE_SECONDS.heist}s (open the vault, grab bags) → getaway ${PHASE_SECONDS.getaway}s (reach the marina pier with a bag) → payout ${PHASE_SECONDS.payout}s (deals settle, scores).`,
  },
  {
    id: "vault",
    keys: ["vault", "bank", "panel", "crack", "open", "hack", "hacker", "drill", "safe"],
    answer: `Go inside the bank to the vault panel, the gold ring on the map during the heist, and stand still beside it. The hacker opens it in ${VAULT_SECONDS_HACKER}s; anyone else takes ${VAULT_SECONDS_OTHER}s. Opening it trips the alarm, so be quick.`,
  },
  {
    id: "bags",
    keys: ["bag", "bags", "grab", "carry", "loot", "money bag", "cash bag", "pick up"],
    answer: `The vault holds ${VAULT_BAGS} bags worth ${money(BAG_VALUE)} dirty cash each. Press G at the open vault to take one. You can carry one at a time, and it slows you to 80% speed. Bank it by reaching the marina pier.`,
  },
  {
    id: "marina",
    keys: ["marina", "pier", "boat", "escape", "bank the bag", "where do i go", "deliver"],
    answer: "The marina pier sits on the far east side, past the beach (open the map with M). Bring a bag there during the getaway to bank it. A car gets you there much faster than running.",
  },
  {
    id: "car",
    keys: ["car", "drive", "vehicle", "steal", "park", "getaway car", "driving"],
    answer: "Cars are waiting at the car park on Second Street; they show as white squares on the map. Walk up and press E to get in. While driving, W/S is throttle and A/D steers. Press E again to get out. Cops can only arrest you on foot.",
  },
  {
    id: "launder",
    keys: ["launder", "laundering", "clean", "dirty", "nightclub", "wash", "convert"],
    answer: "Dirty cash doesn't count toward your score. Take it to the nightclub to launder it: you get 80% back as clean cash. Only clean cash plus stakes counts at the end.",
  },
  {
    id: "deals",
    keys: ["deal", "deals", "split", "propose", "accept", "offer", "share", "agreement", "y/n"],
    answer: "Crewmates can propose a split. Press Y to accept or N to refuse when an offer appears. Accepted deals settle at payout. Read the terms: a deal is only as good as the person who made it.",
  },
  {
    id: "betray",
    keys: ["betray", "betrayal", "backstab", "trust", "double cross", "snitch", "tip off", "tip"],
    answer: `Anyone can betray, which voids all of their accepted deals; they keep whatever they're carrying. Anyone can also tip off the police: the cops see the crew's positions for 30 s and the snitch gets ${money(20000)} clean. Watch who goes quiet.`,
  },
  {
    id: "police",
    keys: ["cop", "cops", "police", "arrest", "caught", "jail", "bribe", "roadblock", "chase"],
    answer: "Two cop agents patrol the bay. A cop arrests you by staying within 2 m of you on foot for 3 s. You drop your bag and you're out for 30 s. Keep moving, use cars, and watch for roadblocks. Some cops take bribes.",
  },
  {
    id: "alarm",
    keys: ["alarm", "siren", "alert"],
    answer: "The alarm goes off when the vault opens, or earlier if someone tips off the police. Once it's ringing, the cops know a heist is on, so move to the marina fast.",
  },
  {
    id: "stakes",
    keys: ["stake", "stakes", "exchange", "stock", "invest", "market", "crash", "price", "buy"],
    answer: "The exchange office sells stakes in 4 local businesses, starting at 100 each. Buying raises the price 1% per 1,000 spent and selling lowers it. If too much clean cash floods the bay (over 600,000), the market crashes 70%. Stakes count toward your score.",
  },
  {
    id: "roles",
    keys: ["role", "roles", "driver", "muscle", "fixer", "who", "crew", "team", "agent", "agents", "ai"],
    answer: "Crew roles: the hacker opens the vault 3× faster, the driver handles getaways, the muscle carries and protects, and the fixer brokers deals. The diamonds (◆) in the player list are AI agents; they play to their own personalities and remember past games.",
  },
  {
    id: "map",
    keys: ["map", "minimap", "where", "navigate", "find", "location", "lost", "direction", "way"],
    answer: "The minimap sits in the bottom-right corner, and M toggles the full labelled map. You're the pink dot, crew are yellow, cops blue, humans white and cars white squares. The dashed gold line points to your current objective. West is Second Street (bank, nightclub, police, pawn shop, exchange); east are the hotels, the avenue, the park, the beach and the marina.",
  },
  {
    id: "ready",
    keys: ["ready", "lobby", "waiting", "nothing happens", "stuck", "begin game"],
    answer: "In the lobby, press R to mark yourself ready. The heist starts once at least two humans are ready, so open a second browser tab if you're testing alone.",
  },
  {
    id: "ledger",
    keys: ["ledger", "log", "tab", "history", "events"],
    answer: "Tab opens the ledger: every action, deal, betrayal and arrest in this session, in order. It's also what the playtest report is built from.",
  },
  {
    id: "radio",
    keys: ["radio", "news", "music", "station", "sound", "audio", "mute", "volume"],
    answer: "Velvet Static 96.6 FM reads the bay's news every so often. The soundtrack is synthesised live and speeds up as the heist heats up. K mutes everything; add ?mute=1 to the URL to start muted.",
  },
  {
    id: "graphics",
    keys: ["graphics", "quality", "lag", "slow", "fps", "performance", "low", "high"],
    answer: "Add ?quality=low (no reflections, ambient occlusion or post-effects), ?quality=medium (the default) or ?quality=high to the URL. The sky moves from golden hour to night as the session goes on.",
  },
];

const STOP = new Set(["the", "a", "an", "i", "do", "how", "what", "is", "to", "can", "you", "me", "my", "of", "in", "it", "and", "or", "does", "should", "get"]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/** Best-matching topic for a question, or null. Phrase keys score higher than single words. */
export function answer(question: string): Topic | null {
  const q = ` ${question.toLowerCase()} `;
  const ws = words(question);
  let best: { t: Topic; s: number } | null = null;
  for (const t of TOPICS) {
    let s = 0;
    for (const k of t.keys) {
      if (k.includes(" ")) {
        if (q.includes(k)) s += 3;
      } else if (ws.some((w) => w === k || (k.length > 3 && w.startsWith(k)))) s += 2;
    }
    if (s > 0 && (!best || s > best.s)) best = { t, s };
  }
  return best?.t ?? null;
}

/** What to do right now, from the phase and whether you're carrying a bag. */
export function nextStep(phase: string, carrying: boolean, inVehicle: boolean): string {
  if (carrying) return "You're carrying a bag. Get it to the marina pier (east, past the beach); a car is fastest.";
  switch (phase) {
    case "lobby":
      return "Press R to get ready. The heist starts when two humans are ready.";
    case "plan":
      return "Head to the nightclub on Second Street and talk terms with your crew.";
    case "prepare":
      return inVehicle ? "Nice ride. Scout the bank and park somewhere handy for the getaway." : "Grab a getaway car from the car park (press E next to one), then scout the bank.";
    case "heist":
      return "Get inside the bank to the vault panel and stand there until it opens, then press G to grab a bag.";
    case "getaway":
      return "Run, or drive, any bag to the marina pier before the timer ends. Stay away from cops while on foot.";
    case "payout":
      return "Deals are settling. Launder dirty cash at the nightclub if you still can.";
    default:
      return "The session is over. Check the scores in the player list.";
  }
}
