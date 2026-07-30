import type { Delivery, Player, UUID } from "./types";

/** A delivery counts toward the over unless it is a wide or a no-ball. */
export const isLegalBall = (d: Delivery) => d.extra_type !== "wide" && d.extra_type !== "noball";

/** Total runs the delivery gave the batting side. */
export const deliveryRuns = (d: Delivery) => d.runs_off_bat + d.extra_runs;

export const isWicket = (d: Delivery) => Boolean(d.wicket_type) && d.wicket_type !== "retired";

export type InningsSummary = {
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  runRate: number;
  extras: number;
};

export function summariseInnings(deliveries: Delivery[]): InningsSummary {
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let extras = 0;
  for (const d of deliveries) {
    runs += deliveryRuns(d);
    extras += d.extra_runs;
    if (isWicket(d)) wickets += 1;
    if (isLegalBall(d)) legalBalls += 1;
  }
  const oversFloat = legalBalls / 6;
  return {
    runs,
    wickets,
    legalBalls,
    extras,
    overs: formatOvers(legalBalls),
    runRate: legalBalls === 0 ? 0 : runs / oversFloat,
  };
}

export const formatOvers = (legalBalls: number) =>
  `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

export type BattingLine = {
  playerId: UUID;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  howOut: string | null;
  strikeRate: number;
};

export function battingCard(deliveries: Delivery[]): BattingLine[] {
  const lines = new Map<UUID, BattingLine>();
  const line = (id: UUID) => {
    let l = lines.get(id);
    if (!l) {
      l = {
        playerId: id,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
        howOut: null,
        strikeRate: 0,
      };
      lines.set(id, l);
    }
    return l;
  };

  for (const d of deliveries) {
    if (d.striker_id) {
      const l = line(d.striker_id);
      l.runs += d.runs_off_bat;
      if (d.extra_type !== "wide") l.balls += 1;
      if (d.runs_off_bat === 4) l.fours += 1;
      if (d.runs_off_bat === 6) l.sixes += 1;
    }
    if (d.dismissed_player_id && d.wicket_type) {
      const l = line(d.dismissed_player_id);
      l.out = d.wicket_type !== "retired";
      l.howOut = d.wicket_type;
    }
  }

  for (const l of lines.values()) {
    l.strikeRate = l.balls === 0 ? 0 : (l.runs / l.balls) * 100;
  }
  return [...lines.values()];
}

export type BowlingLine = {
  playerId: UUID;
  legalBalls: number;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
};

/** Runs charged to the bowler — byes and leg byes are not their fault. */
export const runsChargedToBowler = (d: Delivery) =>
  d.runs_off_bat +
  (d.extra_type === "wide" || d.extra_type === "noball" || d.extra_type === "penalty"
    ? d.extra_runs
    : 0);

export const isBowlerWicket = (d: Delivery) =>
  Boolean(d.wicket_type) &&
  d.wicket_type !== "run out" &&
  d.wicket_type !== "retired" &&
  d.wicket_type !== "retired out" &&
  d.wicket_type !== "obstructing the field";

export function bowlingCard(deliveries: Delivery[]): BowlingLine[] {
  const lines = new Map<UUID, BowlingLine>();
  for (const d of deliveries) {
    if (!d.bowler_id) continue;
    let l = lines.get(d.bowler_id);
    if (!l) {
      l = {
        playerId: d.bowler_id,
        legalBalls: 0,
        overs: "0.0",
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0,
      };
      lines.set(d.bowler_id, l);
    }
    if (isLegalBall(d)) l.legalBalls += 1;
    l.runs += runsChargedToBowler(d);
    if (isBowlerWicket(d)) l.wickets += 1;
  }

  // A maiden is a completed over by one bowler that conceded nothing.
  const overs = new Map<string, Delivery[]>();
  for (const d of deliveries) {
    if (!d.bowler_id) continue;
    const key = `${d.bowler_id}#${d.over_number}`;
    overs.set(key, [...(overs.get(key) ?? []), d]);
  }
  for (const [key, balls] of overs) {
    const legal = balls.filter(isLegalBall).length;
    const conceded = balls.reduce((s, d) => s + runsChargedToBowler(d), 0);
    if (legal >= 6 && conceded === 0) {
      const line = lines.get(key.split("#")[0]);
      if (line) line.maidens += 1;
    }
  }

  for (const l of lines.values()) {
    l.overs = formatOvers(l.legalBalls);
    l.economy = l.legalBalls === 0 ? 0 : l.runs / (l.legalBalls / 6);
  }
  return [...lines.values()];
}

export type FallOfWicket = {
  wicket: number;
  runs: number;
  overs: string;
  playerId: UUID | null;
  wicketType: string | null;
};

export function fallOfWickets(deliveries: Delivery[]): FallOfWicket[] {
  const out: FallOfWicket[] = [];
  let runs = 0;
  let legal = 0;
  let count = 0;
  for (const d of deliveries) {
    runs += deliveryRuns(d);
    if (isLegalBall(d)) legal += 1;
    if (isWicket(d)) {
      count += 1;
      out.push({
        wicket: count,
        runs,
        overs: formatOvers(legal),
        playerId: d.dismissed_player_id ?? d.striker_id,
        wicketType: d.wicket_type,
      });
    }
  }
  return out;
}

export type Partnership = {
  wicket: number;
  runs: number;
  balls: number;
  batters: UUID[];
  unbroken: boolean;
};

export function partnerships(deliveries: Delivery[]): Partnership[] {
  const out: Partnership[] = [];
  let runs = 0;
  let balls = 0;
  let wicket = 1;
  const batters = new Set<UUID>();
  for (const d of deliveries) {
    if (d.striker_id) batters.add(d.striker_id);
    if (d.non_striker_id) batters.add(d.non_striker_id);
    runs += deliveryRuns(d);
    if (isLegalBall(d)) balls += 1;
    if (isWicket(d)) {
      out.push({ wicket, runs, balls, batters: [...batters], unbroken: false });
      wicket += 1;
      runs = 0;
      balls = 0;
      batters.clear();
    }
  }
  if (balls > 0 || runs > 0) out.push({ wicket, runs, balls, batters: [...batters], unbroken: true });
  return out;
}

/** Fielding contributions credited by this delivery. */
export function fieldingCredits(d: Delivery): { playerId: UUID; kind: "catch" | "runout" | "stumping" }[] {
  if (!d.wicket_type) return [];
  const ids = [d.fielder_id, d.fielder2_id].filter(Boolean) as UUID[];
  if (d.wicket_type === "caught") return ids.slice(0, 1).map((playerId) => ({ playerId, kind: "catch" as const }));
  if (d.wicket_type === "stumped")
    return ids.slice(0, 1).map((playerId) => ({ playerId, kind: "stumping" as const }));
  if (d.wicket_type === "run out") return ids.map((playerId) => ({ playerId, kind: "runout" as const }));
  return [];
}


export type CareerBatting = {
  runs: number;
  balls: number;
  innings: number;
  dismissals: number;
  average: number | null;
  strikeRate: number;
  fours: number;
  sixes: number;
  highScore: number;
};

export function careerBatting(deliveries: Delivery[], playerId: UUID): CareerBatting {
  const mine = deliveries.filter((d) => d.striker_id === playerId);
  const runs = mine.reduce((s, d) => s + d.runs_off_bat, 0);
  const balls = mine.filter((d) => d.extra_type !== "wide").length;
  const innings = new Set(mine.map((d) => d.innings_id)).size;
  const dismissals = deliveries.filter(
    (d) => d.dismissed_player_id === playerId && d.wicket_type && d.wicket_type !== "retired",
  ).length;
  const perInnings = new Map<UUID, number>();
  for (const d of mine) perInnings.set(d.innings_id, (perInnings.get(d.innings_id) ?? 0) + d.runs_off_bat);
  return {
    runs,
    balls,
    innings,
    dismissals,
    average: dismissals === 0 ? null : runs / dismissals,
    strikeRate: balls === 0 ? 0 : (runs / balls) * 100,
    fours: mine.filter((d) => d.runs_off_bat === 4).length,
    sixes: mine.filter((d) => d.runs_off_bat === 6).length,
    highScore: Math.max(0, ...perInnings.values()),
  };
}

export type CareerBowling = {
  legalBalls: number;
  overs: string;
  runs: number;
  wickets: number;
  economy: number;
  average: number | null;
  strikeRate: number | null;
};

export function careerBowling(deliveries: Delivery[], playerId: UUID): CareerBowling {
  const mine = deliveries.filter((d) => d.bowler_id === playerId);
  const [line] = bowlingCard(mine);
  const legalBalls = line?.legalBalls ?? 0;
  const runs = line?.runs ?? 0;
  const wickets = line?.wickets ?? 0;
  return {
    legalBalls,
    overs: formatOvers(legalBalls),
    runs,
    wickets,
    economy: legalBalls === 0 ? 0 : runs / (legalBalls / 6),
    average: wickets === 0 ? null : runs / wickets,
    strikeRate: wickets === 0 ? null : legalBalls / wickets,
  };
}

export const playerName = (players: Player[] | undefined, id: UUID | null | undefined) =>
  (id && players?.find((p) => p.id === id)?.full_name) || "—";

/** Compact scorecard token for a single ball, e.g. "4", "W", "1wd", "•". */
export function ballLabel(d: Delivery): string {
  if (isWicket(d)) return "W";
  if (d.extra_type === "wide") return `${d.extra_runs > 1 ? d.extra_runs - 1 : ""}wd`;
  if (d.extra_type === "noball") return `${d.runs_off_bat || ""}nb`;
  if (d.extra_type === "bye") return `${d.extra_runs}b`;
  if (d.extra_type === "legbye") return `${d.extra_runs}lb`;
  return d.runs_off_bat === 0 ? "•" : String(d.runs_off_bat);
}
