// Deals and betrayal (SPEC.md section 11, "Deals and betrayal").
import type { DealTerms, Phase } from "@neon-bay/shared";
import type { Deal, GameState } from "../game/state.js";

type Result = { ok: boolean; reason: string; deal?: Deal };

const DEAL_PHASES: Phase[] = ["plan", "prepare", "heist", "getaway"];

export function proposeDeal(state: GameState, fromId: string, toId: string, terms: DealTerms): Result {
  if (!DEAL_PHASES.includes(state.phase)) return { ok: false, reason: `deals can only be made from plan to getaway, not ${state.phase}` };
  if (fromId === toId) return { ok: false, reason: "you cannot make a deal with yourself" };
  const to = state.players.get(toId);
  if (!to) return { ok: false, reason: `no player with id ${toId}` };
  const deal: Deal = {
    id: `deal_${state.nextDealNumber++}`,
    fromId,
    toId,
    splitPercent: terms.splitPercent,
    note: terms.note,
    status: "pending",
    createdTick: state.tick,
    settledAmount: 0,
  };
  state.deals.set(deal.id, deal);
  if (to.role === "cop") return { ok: true, reason: `offered ${to.name} a bribe (${deal.id}): ${terms.splitPercent}% of your cash, paid if they take it`, deal };
  return { ok: true, reason: `proposed ${deal.id}: ${terms.splitPercent}% of your take`, deal };
}

function respond(state: GameState, playerId: string, dealId: string, to: "accepted" | "rejected"): Result {
  if (!DEAL_PHASES.includes(state.phase)) return { ok: false, reason: `deals cannot be answered during ${state.phase}` };
  const deal = state.deals.get(dealId);
  if (!deal) return { ok: false, reason: `no deal ${dealId}` };
  if (deal.toId !== playerId) return { ok: false, reason: "only the player the deal was offered to can answer it" };
  if (deal.status !== "pending") return { ok: false, reason: `deal ${dealId} is already ${deal.status}` };
  if (to === "accepted" && state.players.get(playerId)?.role === "cop") return { ok: false, reason: `${dealId} is a bribe; use accept_bribe to take it` };
  deal.status = to;
  return { ok: true, reason: `${to} ${dealId}`, deal };
}

export const acceptDeal = (s: GameState, playerId: string, dealId: string) => respond(s, playerId, dealId, "accepted");
export const rejectDeal = (s: GameState, playerId: string, dealId: string) => respond(s, playerId, dealId, "rejected");

/** Betrayal voids every accepted deal the player is part of. They keep what they carry. */
export function betray(state: GameState, playerId: string): Result & { voided: Deal[] } {
  if (state.phase === "lobby" || state.phase === "payout" || state.phase === "ended") {
    return { ok: false, reason: `there is nothing to betray during ${state.phase}`, voided: [] };
  }
  const voided = [...state.deals.values()].filter((d) => d.status === "accepted" && (d.fromId === playerId || d.toId === playerId));
  for (const d of voided) d.status = "void";
  return { ok: true, reason: voided.length ? `voided ${voided.map((d) => d.id).join(", ")}` : "betrayed the crew (no deals to void)", voided };
}

/** At payout, each accepted deal moves splitPercent of the proposer's dirty cash to the recipient. */
export function settleDeals(state: GameState): Deal[] {
  const settled: Deal[] = [];
  for (const d of state.deals.values()) {
    if (d.status !== "accepted") continue;
    const from = state.players.get(d.fromId);
    const to = state.players.get(d.toId);
    d.status = "settled";
    if (!from || !to) continue;
    const amount = Math.floor((from.dirtyCash * d.splitPercent) / 100);
    from.dirtyCash -= amount;
    to.dirtyCash += amount;
    d.settledAmount = amount;
    settled.push(d);
  }
  return settled;
}

export function dealsFor(state: GameState, playerId: string): Deal[] {
  return [...state.deals.values()].filter((d) => d.fromId === playerId || d.toId === playerId);
}
