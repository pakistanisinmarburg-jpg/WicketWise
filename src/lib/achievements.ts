import { fieldingStats, fullBatting, fullBowling, type InningsIndex } from "./stats";
import type { Achievement, Delivery, UUID } from "./types";

/** Badges are awarded from the derived stats — never granted by hand. */
export function achievementsFor(
  deliveries: Delivery[],
  playerId: UUID,
  index: InningsIndex = {},
  extras: { isCaptain?: boolean; manOfTheMatch?: number; tournamentsWon?: number } = {},
): Achievement[] {
  const bat = fullBatting(deliveries, playerId, index);
  const bowl = fullBowling(deliveries, playerId, index);
  const field = fieldingStats(deliveries, playerId);

  const make = (
    code: Achievement["code"],
    label: string,
    description: string,
    progress: number,
    target: number,
  ): Achievement => ({ code, label, description, progress, target, earned: progress >= target });

  return [
    make("half_century", "Half Century", "Score 50 in an innings", bat.highScore, 50),
    make("century", "Century", "Score 100 in an innings", bat.highScore, 100),
    make("five_wicket_haul", "Five-Wicket Haul", "Take 5 wickets in an innings", bowl.best?.wickets ?? 0, 5),
    make("man_of_the_match", "Man of the Match", "Win a match award", extras.manOfTheMatch ?? 0, 1),
    make("tournament_winner", "Tournament Winner", "Win a tournament", extras.tournamentsWon ?? 0, 1),
    make("1000_runs", "1000 Career Runs", "Score 1000 career runs", bat.runs, 1000),
    make("50_wickets", "50 Career Wickets", "Take 50 career wickets", bowl.wickets, 50),
    make("25_catches", "25 Catches", "Hold 25 career catches", field.catches, 25),
    make("captain", "Captain", "Lead a team", extras.isCaptain ? 1 : 0, 1),
  ];
}
