import { describe, expect, it } from "vitest";
import { BAG_VALUE, LOCATIONS, PHASE_SECONDS, POINTS_OF_INTEREST, type Role } from "@neon-bay/shared";
import { createGameState, type GamePlayer, type GameState } from "../game/state.js";
import { acceptDeal, betray, proposeDeal, rejectDeal, settleDeals } from "./deals.js";
import { bankAtMarina, grabBag, vaultTick } from "./heist.js";
import { advancePhase, DEFAULT_PHASE_CONFIG, enterPhase } from "./phases.js";
import { computeScores } from "./score.js";

function player(id: string, role: Role, kind: "human" | "agent" = "agent"): GamePlayer {
  return { id, name: id, kind, role, persona: "none", ready: false, dirtyCash: 0, cleanCash: 0, carryingBag: false, arrested: false, score: 0 };
}

function stateWith(...players: GamePlayer[]): GameState {
  const s = createGameState("test", 4);
  for (const p of players) s.players.set(p.id, p);
  return s;
}

const run = (s: GameState, seconds: number, dt = 1 / 60) => {
  const entered = [];
  for (let t = 0; t < seconds; t += dt) {
    const e = advancePhase(s, dt, DEFAULT_PHASE_CONFIG);
    if (e) entered.push(e);
  }
  return entered;
};

describe("phases", () => {
  it("waits in the lobby until two humans are ready", () => {
    const a = player("a", "human", "human");
    const b = player("b", "human", "human");
    const s = stateWith(a, b, player("rico", "driver"));
    expect(run(s, 5)).toEqual([]);
    a.ready = true;
    expect(run(s, 5)).toEqual([]);
    b.ready = true;
    expect(run(s, 0.1)).toEqual(["plan"]);
    expect(s.phaseTimeLeft).toBeCloseTo(PHASE_SECONDS.plan, 0);
  });

  it("runs plan, prepare, heist, getaway and payout for their spec lengths, then ends", () => {
    const s = stateWith(player("a", "human", "human"));
    enterPhase(s, "plan", DEFAULT_PHASE_CONFIG);
    const total = PHASE_SECONDS.plan + PHASE_SECONDS.prepare + PHASE_SECONDS.heist + PHASE_SECONDS.getaway + PHASE_SECONDS.payout;
    expect(run(s, total - 1)).toEqual(["prepare", "heist", "getaway", "payout"]);
    expect(run(s, 1.1)).toEqual(["ended"]);
    expect(s.phaseStartedAt.heist).toBeCloseTo(PHASE_SECONDS.plan + PHASE_SECONDS.prepare, 0);
    expect(run(s, 10)).toEqual([]);
  });
});

describe("vault and bags", () => {
  const panel = POINTS_OF_INTEREST.vault_panel;
  const openVault = (s: GameState, who: GamePlayer, seconds: number) => {
    let opened = false;
    for (let t = 0; t < seconds; t += 0.05) opened = vaultTick(s, new Map([[who.id, panel]]), 0.05) || opened;
    return opened;
  };

  it("a hacker opens it in 20 s, anyone else takes three times as long, and the alarm goes off", () => {
    const h = player("h", "hacker");
    const s = stateWith(h);
    enterPhase(s, "heist", DEFAULT_PHASE_CONFIG);
    expect(openVault(s, h, 19.5)).toBe(false);
    expect(openVault(s, h, 0.6)).toBe(true);
    expect(s.alarm).toBe(true);

    const m = player("m", "muscle");
    const s2 = stateWith(m);
    enterPhase(s2, "heist", DEFAULT_PHASE_CONFIG);
    expect(openVault(s2, m, 59)).toBe(false);
    expect(openVault(s2, m, 1.1)).toBe(true);
  });

  it("only opens during the heist and only counts players at the panel", () => {
    const h = player("h", "hacker");
    const s = stateWith(h);
    enterPhase(s, "prepare", DEFAULT_PHASE_CONFIG);
    expect(openVault(s, h, 30)).toBe(false);
    enterPhase(s, "heist", DEFAULT_PHASE_CONFIG);
    vaultTick(s, new Map([["h", LOCATIONS.bank.entrance]]), 30);
    expect(s.vault.open).toBe(false);
  });

  it("holds four bags, one per player, and a bag at the marina banks 50,000 dirty cash", () => {
    const ps = ["a", "b", "c", "d", "e"].map((id) => player(id, "muscle"));
    const s = stateWith(...ps);
    enterPhase(s, "heist", DEFAULT_PHASE_CONFIG);
    expect(grabBag(s, ps[0]!, panel).reason).toMatch(/closed/);
    s.vault.open = true;
    expect(grabBag(s, ps[0]!, LOCATIONS.bank.entrance).reason).toMatch(/within/);
    for (const p of ps.slice(0, 4)) expect(grabBag(s, p, panel).ok).toBe(true);
    expect(grabBag(s, ps[0]!, panel).reason).toMatch(/already/);
    expect(grabBag(s, ps[4]!, panel).reason).toMatch(/empty/);

    expect(bankAtMarina(s, ps[0]!, LOCATIONS.bank.entrance)).toBe(false);
    expect(bankAtMarina(s, ps[0]!, LOCATIONS.marina.center)).toBe(true);
    expect(ps[0]!.dirtyCash).toBe(BAG_VALUE);
    expect(ps[0]!.carryingBag).toBe(false);
    expect(s.bagsBanked).toBe(1);
  });

  it("cops cannot take bags", () => {
    const c = player("c", "cop");
    const s = stateWith(c);
    enterPhase(s, "heist", DEFAULT_PHASE_CONFIG);
    s.vault.open = true;
    expect(grabBag(s, c, panel).ok).toBe(false);
  });
});

describe("deals and betrayal", () => {
  it("settles accepted deals at payout by moving the agreed share of the proposer's take", () => {
    const a = player("a", "driver");
    const b = player("b", "hacker");
    const c = player("c", "muscle");
    const s = stateWith(a, b, c);
    expect(proposeDeal(s, "a", "b", { splitPercent: 30, note: "" }).ok).toBe(false); // lobby
    enterPhase(s, "plan", DEFAULT_PHASE_CONFIG);
    const d1 = proposeDeal(s, "a", "b", { splitPercent: 30, note: "for the hack" }).deal!;
    const d2 = proposeDeal(s, "c", "a", { splitPercent: 50, note: "" }).deal!;
    expect(acceptDeal(s, "a", d1.id).ok).toBe(false); // only the recipient answers
    expect(acceptDeal(s, "b", d1.id).ok).toBe(true);
    expect(acceptDeal(s, "b", d1.id).ok).toBe(false); // already answered
    expect(rejectDeal(s, "a", d2.id).ok).toBe(true);
    a.dirtyCash = 100_000;
    c.dirtyCash = 50_000;
    enterPhase(s, "payout", DEFAULT_PHASE_CONFIG);
    const settled = settleDeals(s);
    expect(settled.map((d) => d.id)).toEqual([d1.id]);
    expect(a.dirtyCash).toBe(70_000);
    expect(b.dirtyCash).toBe(30_000);
    expect(c.dirtyCash).toBe(50_000);
  });

  it("betray voids the betrayer's accepted deals and they keep what they carry", () => {
    const a = player("a", "driver");
    const b = player("b", "muscle");
    const s = stateWith(a, b);
    enterPhase(s, "plan", DEFAULT_PHASE_CONFIG);
    const d = proposeDeal(s, "b", "a", { splitPercent: 40, note: "" }).deal!;
    acceptDeal(s, "a", d.id);
    enterPhase(s, "getaway", DEFAULT_PHASE_CONFIG);
    b.carryingBag = true;
    b.dirtyCash = 50_000;
    const r = betray(s, "b");
    expect(r.ok).toBe(true);
    expect(r.voided.map((x) => x.id)).toEqual([d.id]);
    expect(b.carryingBag).toBe(true);
    enterPhase(s, "payout", DEFAULT_PHASE_CONFIG);
    expect(settleDeals(s)).toEqual([]);
    expect(b.dirtyCash).toBe(50_000);
  });
});

describe("score", () => {
  it("is clean cash plus stake value", () => {
    const a = player("a", "driver");
    a.cleanCash = 40_000;
    a.dirtyCash = 99_999; // dirty cash does not score
    const s = stateWith(a, player("b", "hacker"));
    computeScores(s, (id) => (id === "a" ? 5_000 : 0));
    expect(s.players.get("a")!.score).toBe(45_000);
    expect(s.players.get("b")!.score).toBe(0);
  });
});
