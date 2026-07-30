import { deliveryRuns, formatOvers, isLegalBall, isWicket } from "./cricket";
import type { Delivery, UUID } from "./types";

/**
 * Commentary is derived from the structured delivery, never typed by the scorer.
 * That keeps the ball-by-ball feed consistent and translatable later.
 */
export type CommentaryLine = {
  id: UUID;
  over: string;
  text: string;
  tone: "wicket" | "boundary" | "extra" | "normal";
};

const SHOT = ["through cover", "down the ground", "over midwicket", "past point", "off the pads", "square of the wicket"];
const FIELD = ["at long-on", "at deep midwicket", "at cover", "behind the stumps", "at mid-off"];

/** Deterministic pick, so the same ball always reads the same way. */
const pick = <T,>(list: T[], seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
};

export function commentaryFor(
  d: Delivery,
  overLabel: string,
  name: (id: UUID | null | undefined) => string,
): CommentaryLine {
  const striker = name(d.striker_id);
  const bowler = name(d.bowler_id);
  const shot = pick(SHOT, d.id + "s");

  if (isWicket(d) || d.wicket_type) {
    const out = name(d.dismissed_player_id ?? d.striker_id);
    const fielder = name(d.fielder_id);
    let how = `${d.wicket_type}`;
    if (d.wicket_type === "caught") how = `caught ${d.fielder_id ? `by ${fielder} ${pick(FIELD, d.id + "f")}` : pick(FIELD, d.id + "f")}`;
    if (d.wicket_type === "bowled") how = `bowled through the gate by ${bowler}`;
    if (d.wicket_type === "lbw") how = `trapped in front by ${bowler}`;
    if (d.wicket_type === "run out") how = `run out${d.fielder_id ? ` by ${fielder}` : ""}`;
    if (d.wicket_type === "stumped") how = `stumped${d.fielder_id ? ` by ${fielder}` : ""}`;
    if (d.wicket_type === "hit wicket") how = "hit wicket";
    if (d.wicket_type === "retired" || d.wicket_type === "retired out") how = "retires";
    if (d.wicket_type === "obstructing the field") how = "given out obstructing the field";
    return { id: d.id, over: overLabel, text: `WICKET! ${out} ${how}`, tone: "wicket" };
  }

  if (d.extra_type === "wide")
    return { id: d.id, over: overLabel, text: `Wide. ${bowler} sprays it down the leg side, ${d.extra_runs} extra${d.extra_runs > 1 ? "s" : ""}`, tone: "extra" };
  if (d.extra_type === "noball")
    return {
      id: d.id,
      over: overLabel,
      text: `No ball! ${bowler} oversteps${d.runs_off_bat ? ` and ${striker} takes ${d.runs_off_bat}` : ""}`,
      tone: "extra",
    };
  if (d.extra_type === "bye")
    return { id: d.id, over: overLabel, text: `${d.extra_runs} bye${d.extra_runs > 1 ? "s" : ""}, beats everyone`, tone: "extra" };
  if (d.extra_type === "legbye")
    return { id: d.id, over: overLabel, text: `${d.extra_runs} leg bye${d.extra_runs > 1 ? "s" : ""} off the pad`, tone: "extra" };
  if (d.extra_type === "penalty")
    return { id: d.id, over: overLabel, text: `${d.extra_runs} penalty runs awarded`, tone: "extra" };

  if (d.runs_off_bat === 6)
    return { id: d.id, over: overLabel, text: `SIX! ${striker} clears the rope ${shot}`, tone: "boundary" };
  if (d.runs_off_bat === 4)
    return { id: d.id, over: overLabel, text: `FOUR! ${striker} drives ${shot}`, tone: "boundary" };
  if (d.runs_off_bat === 0)
    return { id: d.id, over: overLabel, text: `${striker} defends ${bowler}, no run`, tone: "normal" };

  return {
    id: d.id,
    over: overLabel,
    text: `${striker} works it ${shot} for ${d.runs_off_bat}`,
    tone: "normal",
  };
}

/** Whole innings feed, newest first, with running over labels. */
export function commentaryFeed(
  deliveries: Delivery[],
  name: (id: UUID | null | undefined) => string,
): CommentaryLine[] {
  let legal = 0;
  const lines: CommentaryLine[] = [];
  for (const d of deliveries) {
    if (isLegalBall(d)) legal += 1;
    const label = `${Math.floor((legal === 0 ? 0 : legal - 1) / 6)}.${legal === 0 ? 1 : ((legal - 1) % 6) + 1}`;
    lines.push(commentaryFor(d, label, name));
  }
  return lines.reverse();
}

export const overLabelFor = (legalBallsBefore: number) => formatOvers(legalBallsBefore + 1);

export const isNotable = (d: Delivery) =>
  Boolean(d.wicket_type) || d.runs_off_bat >= 4 || deliveryRuns(d) >= 4;
