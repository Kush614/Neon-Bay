import type { GameState } from "../game/state.js";

/** Final score is clean cash plus stake value at the end of payout. */
export function computeScores(state: GameState, stakeValue: (playerId: string) => number = () => 0): void {
  for (const p of state.players.values()) p.score = p.cleanCash + stakeValue(p.id);
}
