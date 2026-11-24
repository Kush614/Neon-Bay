import { describe, expect, it } from "vitest";
import { CRASH_CLEAN_CASH, LOCATIONS, type Role } from "@neon-bay/shared";
import { createGameState, newPlayer, type GamePlayer, type GameState } from "../game/state.js";
import { buyStake, exchangeTick, price, sellStake, stakeValue } from "./exchange.js";
import { launder } from "./laundering.js";
import { computeScores } from "./score.js";

const club = LOCATIONS.nightclub.entrance;
const exchange = LOCATIONS.exchange.entrance;

function setup(exploit: boolean, role: Role = "muscle"): { s: GameState; p: GamePlayer } {
  const s = createGameState("t", 4, exploit);
  s.phase = "getaway";
  const p = newPlayer({ id: "p", name: "P", kind: "agent", role, persona: "griefer" });
  s.players.set(p.id, p);
  return { s, p };
}

describe("laundering", () => {
  it("converts all dirty cash at 80% at the nightclub", () => {
    const { s, p } = setup(false);
    p.dirtyCash = 50_000;
    expect(launder(s, p, club)).toMatchObject({ ok: true, credited: 40_000, deducted: 50_000 });
    expect([p.dirtyCash, p.cleanCash]).toEqual([0, 40_000]);
  });

  it("only works at the nightclub, with dirty cash, outside lobby and ended", () => {
    const { s, p } = setup(false);
    expect(launder(s, p, club).reason).toMatch(/no dirty cash/);
    p.dirtyCash = 1000;
    expect(launder(s, p, exchange).reason).toMatch(/nightclub/);
    s.phase = "ended";
    expect(launder(s, p, club).ok).toBe(false);
  });

  it("planted exploit: with the flag on, laundering while carrying a bag never deducts dirty cash", () => {
    const { s, p } = setup(true);
    p.dirtyCash = 50_000;
    p.carryingBag = true;
    launder(s, p, club);
    launder(s, p, club);
    expect([p.dirtyCash, p.cleanCash]).toEqual([50_000, 80_000]);
    // Without a bag the same flag changes nothing.
    p.carryingBag = false;
    launder(s, p, club);
    expect([p.dirtyCash, p.cleanCash]).toEqual([0, 120_000]);
  });

  it("with the flag off, carrying a bag makes no difference", () => {
    const { s, p } = setup(false);
    p.dirtyCash = 50_000;
    p.carryingBag = true;
    launder(s, p, club);
    expect([p.dirtyCash, p.cleanCash]).toEqual([0, 40_000]);
  });
});

describe("exchange", () => {
  it("buying raises the price 1% per 1,000 and selling lowers it the same way", () => {
    const { s, p } = setup(false);
    p.cleanCash = 20_000;
    expect(buyStake(s, p, exchange, "citrus_grove", 10_000).ok).toBe(true);
    expect(price(s, "citrus_grove")).toBeCloseTo(110);
    expect(p.stakes.citrus_grove).toBeCloseTo(10_000 / 110); // fills at the new price
    expect(price(s, "palmetto_video")).toBe(100);
    expect(stakeValue(s, p)).toBe(10_000);
    expect(sellStake(s, p, exchange, "citrus_grove", 1e9).ok).toBe(true);
    expect(p.stakes.citrus_grove).toBe(0);
    expect(price(s, "citrus_grove")).toBeLessThan(110);
  });

  it("a buy-then-sell round trip loses money, however large", () => {
    for (const size of [1_000, 100_000, 500_000]) {
      const { s, p } = setup(false);
      p.cleanCash = size;
      buyStake(s, p, exchange, "citrus_grove", size);
      sellStake(s, p, exchange, "citrus_grove", 1e12);
      expect(p.cleanCash).toBeLessThan(size);
    }
  });

  it("refuses trades away from the exchange, beyond your cash, or by cops", () => {
    const { s, p } = setup(false);
    p.cleanCash = 500;
    expect(buyStake(s, p, club, "citrus_grove", 100).reason).toMatch(/exchange office/);
    expect(buyStake(s, p, exchange, "citrus_grove", 1000).reason).toMatch(/only have/);
    expect(sellStake(s, p, exchange, "citrus_grove", 100).reason).toMatch(/hold no/);
    const cop = setup(false, "cop");
    cop.p.cleanCash = 5000;
    expect(buyStake(cop.s, cop.p, exchange, "citrus_grove", 100).reason).toMatch(/cops/);
  });

  it("crashes once total clean cash passes 600,000: prices fall 70% over 10 s", () => {
    const { s, p } = setup(false);
    p.cleanCash = CRASH_CLEAN_CASH;
    expect(exchangeTick(s)).toBe(false);
    p.cleanCash += 1;
    expect(exchangeTick(s)).toBe(true);
    s.time += 5;
    expect(exchangeTick(s)).toBe(false);
    expect(price(s, "coquina_realty")).toBeCloseTo(65);
    s.time += 20;
    exchangeTick(s);
    expect(price(s, "coquina_realty")).toBeCloseTo(30);
    // Once a session: falling back under the line and over again does not re-crash.
    p.cleanCash = 0;
    exchangeTick(s);
    p.cleanCash = CRASH_CLEAN_CASH * 2;
    expect(exchangeTick(s)).toBe(false);
  });

  it("scores clean cash plus stake value", () => {
    const { s, p } = setup(false);
    p.cleanCash = 15_000;
    buyStake(s, p, exchange, "seaspray_telecom", 10_000);
    computeScores(s, () => stakeValue(s, p));
    expect(p.score).toBe(5_000 + 10_000);
  });
});
