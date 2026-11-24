// The stake exchange and the crash (SPEC.md section 11, "Exchange").
import {
  BUSINESSES,
  CRASH_CLEAN_CASH,
  CRASH_DROP,
  CRASH_SECONDS,
  LOCATIONS,
  STAKE_IMPACT_PER_1000,
  VENUE_RADIUS,
  type BusinessId,
  type Phase,
} from "@neon-bay/shared";
import type { GamePlayer, GameState } from "../game/state.js";

type XZ = { x: number; z: number };
type Result = { ok: boolean; reason: string };

const TRADE_PHASES: Phase[] = ["plan", "prepare", "heist", "getaway", "payout"];

export function atExchange(p: XZ): boolean {
  const e = LOCATIONS.exchange.entrance;
  return Math.hypot(p.x - e.x, p.z - e.z) <= VENUE_RADIUS;
}

export function price(state: GameState, b: BusinessId): number {
  return state.exchange.base[b] * state.exchange.factor;
}

export function prices(state: GameState): Record<BusinessId, number> {
  return Object.fromEntries(Object.keys(BUSINESSES).map((b) => [b, price(state, b as BusinessId)])) as Record<BusinessId, number>;
}

/** Price multiplier for trading `amount` of cash: 1% per 1,000. */
const impact = (amount: number) => 1 + (STAKE_IMPACT_PER_1000 * amount) / 1000;

const money = (n: number) => Math.round(n).toLocaleString("en-US");

function tradeCheck(state: GameState, p: GamePlayer, pos: XZ): string | null {
  if (!TRADE_PHASES.includes(state.phase)) return `the exchange is closed during ${state.phase}`;
  if (p.role === "cop") return "cops cannot trade stakes";
  if (!atExchange(pos)) return `you must be within ${VENUE_RADIUS} m of the exchange office`;
  return null;
}

/**
 * Spend `amount` clean cash on stakes. The price rises 1% per 1,000 and the order fills at the
 * new price, so a trader cannot pump a stake and sell it back at a profit (no second exploit).
 */
export function buyStake(state: GameState, p: GamePlayer, pos: XZ, b: BusinessId, amount: number): Result {
  const bad = tradeCheck(state, p, pos);
  if (bad) return { ok: false, reason: bad };
  if (amount > p.cleanCash) return { ok: false, reason: `you only have ${money(p.cleanCash)} clean cash` };
  state.exchange.base[b] *= impact(amount);
  const shares = amount / price(state, b);
  p.cleanCash -= amount;
  p.stakes[b] = (p.stakes[b] ?? 0) + shares;
  return { ok: true, reason: `bought ${shares.toFixed(1)} ${BUSINESSES[b].label} shares for ${money(amount)}; price now ${price(state, b).toFixed(2)}` };
}

/** Sell up to `amount` worth of stakes for clean cash. The price falls the same way and the order fills at the new price. */
export function sellStake(state: GameState, p: GamePlayer, pos: XZ, b: BusinessId, amount: number): Result {
  const bad = tradeCheck(state, p, pos);
  if (bad) return { ok: false, reason: bad };
  const held = p.stakes[b] ?? 0;
  if (held <= 0) return { ok: false, reason: `you hold no ${BUSINESSES[b].label} stake` };
  const k = STAKE_IMPACT_PER_1000 / 1000;
  const before = price(state, b);
  // Selling value v costs v * (1 + k v) / price shares; cap v at what the holding covers.
  const maxValue = (-1 + Math.sqrt(1 + 4 * k * held * before)) / (2 * k);
  const value = Math.min(amount, maxValue);
  const sold = value >= maxValue ? held : (value * (1 + k * value)) / before;
  p.stakes[b] = Math.max(0, held - sold);
  p.cleanCash += Math.floor(value);
  state.exchange.base[b] /= impact(value);
  return { ok: true, reason: `sold ${money(value)} of ${BUSINESSES[b].label}; price now ${price(state, b).toFixed(2)}` };
}

export function stakeValue(state: GameState, p: GamePlayer): number {
  let v = 0;
  for (const [b, shares] of Object.entries(p.stakes)) v += (shares ?? 0) * price(state, b as BusinessId);
  return Math.floor(v);
}

export function totalCleanCash(state: GameState): number {
  let total = 0;
  for (const p of state.players.values()) total += p.cleanCash;
  return total;
}

/**
 * Starts the crash once total clean cash passes the threshold, then slides every price
 * down 70% over 10 s. Returns true on the step the crash starts. It happens once a session.
 */
export function exchangeTick(state: GameState): boolean {
  const ex = state.exchange;
  if (ex.crashedAt === null) {
    if (totalCleanCash(state) <= CRASH_CLEAN_CASH) return false;
    ex.crashedAt = state.time;
  }
  const t = Math.min(1, (state.time - ex.crashedAt) / CRASH_SECONDS);
  ex.factor = 1 - CRASH_DROP * t;
  return ex.crashedAt === state.time;
}
