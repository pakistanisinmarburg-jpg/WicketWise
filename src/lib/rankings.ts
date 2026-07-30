import { fieldingStats, fullBatting, fullBowling, type InningsIndex } from "./stats";
import type { Delivery, UUID } from "./types";

/**
 * A single configurable formula drives every leaderboard, so the weights can be
 * tuned later without touching any page.
 */
export type RankingWeights = {
  average: number;
  strikeRate: number;
  volume: number;
  recentForm: number;
  matches: number;
};

export const DEFAULT_BATTING_WEIGHTS: RankingWeights = {
  average: 0.35,
  strikeRate: 0.2,
  volume: 0.25,
  recentForm: 0.15,
  matches: 0.05,
};

export const DEFAULT_BOWLING_WEIGHTS: RankingWeights = {
  average: 0.3,
  strikeRate: 0.2,
  volume: 0.25,
  recentForm: 0.2,
  matches: 0.05,
};

const norm = (v: number, cap: number) => Math.max(0, Math.min(1, v / cap));

export type RankedPlayer = {
  playerId: UUID;
  rating: number;
  batting: ReturnType<typeof fullBatting>;
  bowling: ReturnType<typeof fullBowling>;
  fielding: ReturnType<typeof fieldingStats>;
};

export function ratePlayers(
  deliveries: Delivery[],
  playerIds: UUID[],
  index: InningsIndex = {},
): RankedPlayer[] {
  return playerIds.map((playerId) => ({
    playerId,
    rating: 0,
    batting: fullBatting(deliveries, playerId, index),
    bowling: fullBowling(deliveries, playerId, index),
    fielding: fieldingStats(deliveries, playerId),
  }));
}

export function battingRating(p: RankedPlayer, w: RankingWeights) {
  const b = p.batting;
  const recent = b.entries.slice(-5);
  const form = recent.length ? recent.reduce((s, e) => s + e.runs, 0) / recent.length : 0;
  return (
    100 *
    (w.average * norm(b.average ?? 0, 60) +
      w.strikeRate * norm(b.strikeRate, 200) +
      w.volume * norm(b.runs, 1000) +
      w.recentForm * norm(form, 60) +
      w.matches * norm(b.matches, 50))
  );
}

export function bowlingRating(p: RankedPlayer, w: RankingWeights) {
  const b = p.bowling;
  const recent = b.entries.slice(-5);
  const form = recent.length ? recent.reduce((s, e) => s + e.wickets, 0) / recent.length : 0;
  // Lower is better for average and economy, so invert them.
  const avgScore = b.average === null ? 0 : 1 - norm(b.average, 60);
  const econScore = b.legalBalls === 0 ? 0 : 1 - norm(b.economy, 15);
  return (
    100 *
    (w.average * avgScore +
      w.strikeRate * econScore +
      w.volume * norm(b.wickets, 50) +
      w.recentForm * norm(form, 4) +
      w.matches * norm(b.matches, 50))
  );
}

export const allRounderRating = (
  p: RankedPlayer,
  bat: RankingWeights,
  bowl: RankingWeights,
) => {
  const a = battingRating(p, bat);
  const b = bowlingRating(p, bowl);
  // Harmonic-style blend rewards genuine two-skill players over specialists.
  return a === 0 || b === 0 ? (a + b) / 4 : (2 * a * b) / (a + b);
};
