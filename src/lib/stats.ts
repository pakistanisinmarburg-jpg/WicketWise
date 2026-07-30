import {
  fieldingCredits,
  formatOvers,
  isBowlerWicket,
  isLegalBall,
  isWicket,
  runsChargedToBowler,
  summariseInnings,
} from "./cricket";
import type { Delivery, UUID } from "./types";

/** Innings id → match id, so career stats can count matches, not just innings. */
export type InningsIndex = Record<UUID, UUID>;

export type InningsBattingEntry = {
  inningsId: UUID;
  matchId: UUID | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
};

export type FullBatting = {
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  notOuts: number;
  dismissals: number;
  average: number | null;
  strikeRate: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  highScore: number;
  highScoreNotOut: boolean;
  entries: InningsBattingEntry[];
};

export function fullBatting(
  deliveries: Delivery[],
  playerId: UUID,
  index: InningsIndex = {},
): FullBatting {
  const byInnings = new Map<UUID, InningsBattingEntry>();
  const entry = (id: UUID) => {
    let e = byInnings.get(id);
    if (!e) {
      e = {
        inningsId: id,
        matchId: index[id] ?? null,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
      };
      byInnings.set(id, e);
    }
    return e;
  };

  for (const d of deliveries) {
    if (d.striker_id === playerId) {
      const e = entry(d.innings_id);
      e.runs += d.runs_off_bat;
      if (d.extra_type !== "wide") e.balls += 1;
      if (d.runs_off_bat === 4) e.fours += 1;
      if (d.runs_off_bat === 6) e.sixes += 1;
    }
    if (d.dismissed_player_id === playerId && isWicket(d)) entry(d.innings_id).out = true;
  }

  const entries = [...byInnings.values()];
  const runs = entries.reduce((s, e) => s + e.runs, 0);
  const balls = entries.reduce((s, e) => s + e.balls, 0);
  const dismissals = entries.filter((e) => e.out).length;
  const best = entries.reduce<InningsBattingEntry | null>(
    (b, e) => (b === null || e.runs > b.runs ? e : b),
    null,
  );

  return {
    matches: new Set(entries.map((e) => e.matchId ?? e.inningsId)).size,
    innings: entries.length,
    runs,
    balls,
    notOuts: entries.length - dismissals,
    dismissals,
    average: dismissals === 0 ? null : runs / dismissals,
    strikeRate: balls === 0 ? 0 : (runs / balls) * 100,
    fours: entries.reduce((s, e) => s + e.fours, 0),
    sixes: entries.reduce((s, e) => s + e.sixes, 0),
    fifties: entries.filter((e) => e.runs >= 50 && e.runs < 100).length,
    hundreds: entries.filter((e) => e.runs >= 100).length,
    highScore: best?.runs ?? 0,
    highScoreNotOut: best ? !best.out : false,
    entries,
  };
}

export type InningsBowlingEntry = {
  inningsId: UUID;
  matchId: UUID | null;
  legalBalls: number;
  runs: number;
  wickets: number;
  maidens: number;
};

export type FullBowling = {
  matches: number;
  innings: number;
  legalBalls: number;
  overs: string;
  runs: number;
  wickets: number;
  maidens: number;
  economy: number;
  average: number | null;
  strikeRate: number | null;
  fiveFors: number;
  best: { wickets: number; runs: number } | null;
  entries: InningsBowlingEntry[];
};

export function fullBowling(
  deliveries: Delivery[],
  playerId: UUID,
  index: InningsIndex = {},
): FullBowling {
  const byInnings = new Map<UUID, InningsBowlingEntry>();
  const mine = deliveries.filter((d) => d.bowler_id === playerId);

  for (const d of mine) {
    let e = byInnings.get(d.innings_id);
    if (!e) {
      e = {
        inningsId: d.innings_id,
        matchId: index[d.innings_id] ?? null,
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0,
      };
      byInnings.set(d.innings_id, e);
    }
    if (isLegalBall(d)) e.legalBalls += 1;
    e.runs += runsChargedToBowler(d);
    if (isBowlerWicket(d)) e.wickets += 1;
  }

  // Maidens, per innings and over.
  const overs = new Map<string, Delivery[]>();
  for (const d of mine) overs.set(`${d.innings_id}#${d.over_number}`, [...(overs.get(`${d.innings_id}#${d.over_number}`) ?? []), d]);
  for (const [key, balls] of overs) {
    const legal = balls.filter(isLegalBall).length;
    const conceded = balls.reduce((s, d) => s + runsChargedToBowler(d), 0);
    if (legal >= 6 && conceded === 0) {
      const e = byInnings.get(key.split("#")[0]);
      if (e) e.maidens += 1;
    }
  }

  const entries = [...byInnings.values()];
  const legalBalls = entries.reduce((s, e) => s + e.legalBalls, 0);
  const runs = entries.reduce((s, e) => s + e.runs, 0);
  const wickets = entries.reduce((s, e) => s + e.wickets, 0);
  const best = entries.reduce<InningsBowlingEntry | null>(
    (b, e) => (b === null || e.wickets > b.wickets || (e.wickets === b.wickets && e.runs < b.runs) ? e : b),
    null,
  );

  return {
    matches: new Set(entries.map((e) => e.matchId ?? e.inningsId)).size,
    innings: entries.length,
    legalBalls,
    overs: formatOvers(legalBalls),
    runs,
    wickets,
    maidens: entries.reduce((s, e) => s + e.maidens, 0),
    economy: legalBalls === 0 ? 0 : runs / (legalBalls / 6),
    average: wickets === 0 ? null : runs / wickets,
    strikeRate: wickets === 0 ? null : legalBalls / wickets,
    fiveFors: entries.filter((e) => e.wickets >= 5).length,
    best: best ? { wickets: best.wickets, runs: best.runs } : null,
    entries,
  };
}

export type FieldingStats = { catches: number; runOuts: number; stumpings: number; total: number };

export function fieldingStats(deliveries: Delivery[], playerId: UUID): FieldingStats {
  let catches = 0;
  let runOuts = 0;
  let stumpings = 0;
  for (const d of deliveries) {
    for (const c of fieldingCredits(d)) {
      if (c.playerId !== playerId) continue;
      if (c.kind === "catch") catches += 1;
      if (c.kind === "runout") runOuts += 1;
      if (c.kind === "stumping") stumpings += 1;
    }
  }
  return { catches, runOuts, stumpings, total: catches + runOuts + stumpings };
}

/** Last five innings, most recent first — e.g. 47, 12, 81*, 4, 39. */
export function battingForm(deliveries: Delivery[], playerId: UUID, index: InningsIndex = {}) {
  return fullBatting(deliveries, playerId, index)
    .entries.slice(-5)
    .reverse()
    .map((e) => `${e.runs}${e.out ? "" : "*"}`);
}

export function bowlingForm(deliveries: Delivery[], playerId: UUID, index: InningsIndex = {}) {
  return fullBowling(deliveries, playerId, index)
    .entries.slice(-5)
    .reverse()
    .map((e) => `${e.wickets}/${e.runs}`);
}

/* ---------------------------------------------------------------- records */
export type RecordRow = { playerId?: UUID; teamId?: UUID; label: string; value: string; sort: number };

export function battingRecords(
  deliveries: Delivery[],
  playerIds: UUID[],
  index: InningsIndex = {},
) {
  const all = playerIds.map((id) => ({ id, bat: fullBatting(deliveries, id, index) }));
  const top = (label: string, pick: (b: FullBatting) => number, fmt = (n: number) => String(n)) =>
    all
      .filter((r) => pick(r.bat) > 0)
      .sort((a, b) => pick(b.bat) - pick(a.bat))
      .slice(0, 5)
      .map((r) => ({ playerId: r.id, label, value: fmt(pick(r.bat)), sort: pick(r.bat) }));

  return {
    highestScore: top("Highest score", (b) => b.highScore),
    mostRuns: top("Most runs", (b) => b.runs),
    mostFifties: top("Most fifties", (b) => b.fifties + b.hundreds),
    mostHundreds: top("Most hundreds", (b) => b.hundreds),
    bestStrikeRate: all
      .filter((r) => r.bat.balls >= 30)
      .sort((a, b) => b.bat.strikeRate - a.bat.strikeRate)
      .slice(0, 5)
      .map((r) => ({ playerId: r.id, label: "Best strike rate", value: r.bat.strikeRate.toFixed(1), sort: r.bat.strikeRate })),
  };
}

export function bowlingRecords(
  deliveries: Delivery[],
  playerIds: UUID[],
  index: InningsIndex = {},
) {
  const all = playerIds.map((id) => ({ id, bowl: fullBowling(deliveries, id, index) }));
  return {
    mostWickets: all
      .filter((r) => r.bowl.wickets > 0)
      .sort((a, b) => b.bowl.wickets - a.bowl.wickets)
      .slice(0, 5)
      .map((r) => ({ playerId: r.id, label: "Most wickets", value: String(r.bowl.wickets), sort: r.bowl.wickets })),
    bestFigures: all
      .filter((r) => r.bowl.best && r.bowl.best.wickets > 0)
      .sort((a, b) => b.bowl.best!.wickets - a.bowl.best!.wickets || a.bowl.best!.runs - b.bowl.best!.runs)
      .slice(0, 5)
      .map((r) => ({
        playerId: r.id,
        label: "Best figures",
        value: `${r.bowl.best!.wickets}/${r.bowl.best!.runs}`,
        sort: r.bowl.best!.wickets,
      })),
    mostFiveFors: all
      .filter((r) => r.bowl.fiveFors > 0)
      .sort((a, b) => b.bowl.fiveFors - a.bowl.fiveFors)
      .slice(0, 5)
      .map((r) => ({ playerId: r.id, label: "Five-wicket hauls", value: String(r.bowl.fiveFors), sort: r.bowl.fiveFors })),
    bestEconomy: all
      .filter((r) => r.bowl.legalBalls >= 30)
      .sort((a, b) => a.bowl.economy - b.bowl.economy)
      .slice(0, 5)
      .map((r) => ({ playerId: r.id, label: "Best economy", value: r.bowl.economy.toFixed(2), sort: -r.bowl.economy })),
  };
}

/** Innings totals grouped by batting team — the basis of team records. */
export function inningsTotals(
  deliveries: Delivery[],
  innings: { id: UUID; batting_team_id: UUID; match_id: UUID }[],
) {
  return innings.map((inn) => {
    const balls = deliveries.filter((d) => d.innings_id === inn.id);
    const s = summariseInnings(balls);
    return { ...inn, ...s };
  });
}
