import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, CloudOff, Undo2, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeliveries,
  useInnings,
  useMatch,
  usePlayers,
  useRecordDelivery,
  useSyncStatus,
  useTeamMembers,
  useUndoDelivery,
} from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import { useCanScore } from "@/features/people";
import {
  ballLabel,
  battingCard,
  bowlingCard,
  isLegalBall,
  playerName,
  summariseInnings,
} from "@/lib/cricket";
import { commentaryFor } from "@/lib/commentary";
import { WICKET_TYPES, type Delivery, type ExtraType, type WicketType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/matches/$matchId/score")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Scoring console — WicketWise" },
      { name: "description", content: "Ball-by-ball offline-first scoring console for live matches." },
      { property: "og:title", content: "Scoring console — WicketWise" },
      { property: "og:description", content: "Record every delivery as it happens, online or off." },
    ],
  }),
  component: ScoringConsole,
});

function ScoringConsole() {
  const { matchId } = Route.useParams();
  const match = useMatch(matchId);
  const innings = useInnings(matchId);
  const players = usePlayers();
  const members = useTeamMembers();
  const inningsIds = (innings.data ?? []).map((i) => i.id);
  const deliveries = useDeliveries(inningsIds);
  const record = useRecordDelivery();
  const { user, isAdmin } = useAuth();
  const canScore = useCanScore(matchId, {
    userId: user?.id,
    isAdmin,
    matchCreatedBy: match.data?.created_by,
    matchStatus: match.data?.status,
  });
  const undo = useUndoDelivery();
  const sync = useSyncStatus();

  const current = innings.data?.[innings.data.length - 1];
  const balls = useMemo(
    () => (deliveries.data ?? []).filter((d) => d.innings_id === current?.id),
    [deliveries.data, current?.id],
  );
  const summary = summariseInnings(balls);

  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [extra, setExtra] = useState<ExtraType | null>(null);
  const [pop, setPop] = useState(0);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketType, setWicketType] = useState<WicketType>("bowled");
  const [fielder, setFielder] = useState("");

  useEffect(() => {
    setPop((p) => p + 1);
  }, [summary.runs, summary.wickets]);

  const squad = (teamId?: string) =>
    (players.data ?? []).filter((p) =>
      (members.data ?? []).some((m) => m.team_id === teamId && m.player_id === p.id),
    );
  const battingSquad = squad(current?.batting_team_id);
  const bowlingSquad = squad(current?.bowling_team_id);

  if (match.isLoading || innings.isLoading || canScore.isLoading)
    return <Skeleton className="h-screen" />;
  if (!canScore.data)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <p className="font-medium text-foreground">You don't have scoring access for this match.</p>
          <p>Ask the captain who created it to grant you scorer permission.</p>
          <Link to="/matches/$matchId" params={{ matchId }} className="underline">
            Back to match centre
          </Link>
        </div>
      </div>
    );
  if (!current)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">
        Start an innings first.{" "}
        <Link to="/matches/$matchId" params={{ matchId }} className="ml-1 underline">
          Back to match
        </Link>
      </div>
    );

  const overNumber = Math.floor(summary.legalBalls / 6);
  const legalInOver = balls.filter((d) => d.over_number === overNumber && isLegalBall(d)).length;

  const batting = battingCard(balls);
  const bowling = bowlingCard(balls);
  const strikerLine = batting.find((l) => l.playerId === striker);
  const nonStrikerLine = batting.find((l) => l.playerId === nonStriker);
  const bowlerLine = bowling.find((l) => l.playerId === bowler);

  function save(patch: Partial<Delivery>) {
    if (!striker || !bowler) {
      toast.error("Pick a striker and a bowler first");
      return;
    }
    record.mutate(
      {
        innings_id: current!.id,
        over_number: overNumber,
        ball_number: legalInOver + 1,
        striker_id: striker,
        non_striker_id: nonStriker || null,
        bowler_id: bowler,
        runs_off_bat: 0,
        extra_runs: 0,
        extra_type: null,
        ...patch,
      },
      { onError: (e) => toast.error(e.message) },
    );
    setExtra(null);
  }

  function scoreRuns(runs: number) {
    if (extra === "wide") return save({ extra_type: "wide", extra_runs: 1 + runs });
    if (extra === "noball") return save({ extra_type: "noball", extra_runs: 1, runs_off_bat: runs });
    if (extra === "bye" || extra === "legbye") return save({ extra_type: extra, extra_runs: runs });
    save({ runs_off_bat: runs });
    if (runs % 2 === 1) rotate();
  }

  function rotate() {
    setStriker(nonStriker);
    setNonStriker(striker);
  }

  function confirmWicket() {
    save({
      wicket_type: wicketType,
      dismissed_player_id: striker,
      fielder_id: fielder || null,
    });
    setWicketOpen(false);
    setFielder("");
    setStriker("");
  }

  const last = balls[balls.length - 1];
  const lastLine = last
    ? commentaryFor(last, summary.overs, (id) => playerName(players.data, id))
    : null;
  const needsFielder =
    wicketType === "caught" || wicketType === "run out" || wicketType === "stumped";

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/matches/$matchId" params={{ matchId }}>
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <div key={pop} className="animate-score-pop">
            <p className="tabular text-2xl font-bold">
              {summary.runs}/{summary.wickets}
              <span className="ml-2 text-base font-semibold text-muted-foreground">
                {summary.overs} OV
              </span>
            </p>
            <p className="tabular text-xs text-muted-foreground">RR {summary.runRate.toFixed(2)}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {balls.slice(-6).map((d) => (
              <span
                key={d.id}
                className={cn(
                  "grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold",
                  d.wicket_type && "bg-live/15 text-live",
                  d.runs_off_bat >= 4 && !d.wicket_type && "bg-primary/15 text-primary",
                )}
              >
                {ballLabel(d)}
              </span>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium",
            sync.online && sync.queued === 0
              ? "bg-success/10 text-success"
              : "bg-warning/20 text-warning-foreground",
          )}
        >
          {sync.online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}
          {sync.online
            ? sync.queued > 0
              ? `Syncing — ${sync.queued} ball${sync.queued === 1 ? "" : "s"} queued`
              : "Synced · every ball saved"
            : `Offline — ${sync.queued} ball${sync.queued === 1 ? "" : "s"} queued`}
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <Card className="shadow-card">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
            <PlayerSelect
              label="Striker"
              value={striker}
              onChange={setStriker}
              hint={strikerLine ? `${strikerLine.runs} (${strikerLine.balls})` : "0 (0)"}
              options={battingSquad.length ? battingSquad : (players.data ?? [])}
            />
            <PlayerSelect
              label="Non-striker"
              value={nonStriker}
              onChange={setNonStriker}
              hint={nonStrikerLine ? `${nonStrikerLine.runs} (${nonStrikerLine.balls})` : "0 (0)"}
              options={battingSquad.length ? battingSquad : (players.data ?? [])}
            />
            <PlayerSelect
              label="Bowler"
              value={bowler}
              onChange={setBowler}
              hint={
                bowlerLine
                  ? `${bowlerLine.overs}-${bowlerLine.maidens}-${bowlerLine.runs}-${bowlerLine.wickets}`
                  : "0.0-0-0-0"
              }
              options={bowlingSquad.length ? bowlingSquad : (players.data ?? [])}
            />
          </CardContent>
        </Card>

        {lastLine && (
          <p className="rounded-xl bg-muted/60 px-4 py-2.5 text-sm">
            <span className="tabular mr-2 font-semibold text-muted-foreground">{lastLine.over}</span>
            {lastLine.text}
          </p>
        )}

        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 6].map((r) => (
            <Button
              key={r}
              variant={r >= 4 ? "default" : "secondary"}
              className="h-20 text-2xl font-bold"
              onClick={() => scoreRuns(r)}
              disabled={record.isPending}
            >
              {r}
            </Button>
          ))}
          <Button variant="outline" className="h-20 text-base" onClick={rotate}>
            Swap
          </Button>
          <Button
            variant="outline"
            className="h-20 text-base"
            disabled={!last}
            onClick={() => last && undo.mutate(last.id)}
          >
            <Undo2 className="size-5" /> Undo
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(["wide", "noball", "bye", "legbye"] as ExtraType[]).map((e) => (
            <Button
              key={e}
              variant={extra === e ? "default" : "outline"}
              className="h-14 text-sm uppercase"
              onClick={() => setExtra(extra === e ? null : e)}
            >
              {e === "noball" ? "NB" : e === "wide" ? "WD" : e === "legbye" ? "Leg bye" : "Bye"}
            </Button>
          ))}
        </div>
        {extra && (
          <p className="text-center text-xs text-muted-foreground">
            {extra} armed — tap a run button to record it (0 = the extra alone).
          </p>
        )}

        <Button
          className="h-16 w-full bg-live text-lg font-bold text-white hover:bg-live/90"
          onClick={() => setWicketOpen(true)}
          disabled={record.isPending}
        >
          W — Wicket
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          On strike: {playerName(players.data, striker)} · Bowling:{" "}
          {playerName(players.data, bowler)}
        </p>
      </div>

      <Dialog open={wicketOpen} onOpenChange={setWicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm wicket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {WICKET_TYPES.map((w) => (
                <Button
                  key={w}
                  variant={wicketType === w ? "default" : "outline"}
                  className="h-11 capitalize"
                  onClick={() => setWicketType(w)}
                >
                  {w}
                </Button>
              ))}
            </div>
            {needsFielder && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Fielder involved</p>
                <Select value={fielder} onValueChange={setFielder}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select fielder" />
                  </SelectTrigger>
                  <SelectContent>
                    {(bowlingSquad.length ? bowlingSquad : (players.data ?? [])).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Badge variant="secondary">Out: {playerName(players.data, striker)}</Badge>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWicketOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-live text-white hover:bg-live/90" onClick={confirmWicket}>
              Record wicket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; full_name: string }[];
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="tabular font-semibold text-foreground">{hint}</span>}
      </p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
