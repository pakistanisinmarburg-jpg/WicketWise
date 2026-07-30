import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { LiveDot, StatCounter } from "@/components/stat-counter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateInnings,
  useDeliveries,
  useInnings,
  useMatch,
  usePlayers,
  useTeamMembers,
  useTeams,
  useUpdateMatch,
} from "@/features/api";
import {
  useCanScore,
  useGrantScoring,
  useProfiles,
  useRevokeScoring,
  useScoringPermissions,
} from "@/features/people";
import { useAuth } from "@/features/auth/auth-context";
import { useAdvanceMatchState } from "@/features/competitions";
import {
  statsOfficial,
  useCorrectionRequests,
  useFileCorrection,
  useSetAdminVerificationRequired,
  useSubmitScorecard,
  useVerifyScorecard,
} from "@/features/integrity";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CORRECTABLE_FIELDS } from "@/lib/types";
import { MATCH_FLOW, nextMatchState, type Delivery, type Innings, type Match, type Player } from "@/lib/types";
import {
  ballLabel,
  battingCard,
  bowlingCard,
  fallOfWickets,
  fieldingCredits,
  partnerships,
  playerName,
  summariseInnings,
} from "@/lib/cricket";
import { commentaryFeed } from "@/lib/commentary";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/matches/$matchId/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Match centre — WicketWise" },
      { name: "description", content: "Live score, scorecard, commentary and bowling figures for this match." },
      { property: "og:title", content: "Match centre — WicketWise" },
      { property: "og:description", content: "Follow the score ball by ball." },
    ],
  }),
  component: MatchCentre,
});

const TABS = [
  "Overview",
  "Live",
  "Scorecard",
  "Ball-by-Ball",
  "Commentary",
  "Squads",
  "Playing XI",
  "Toss",
  "Partnerships",
  "Fall of Wickets",
  "Batting",
  "Bowling",
  "Fielding",
  "Statistics",
] as const;

function MatchCentre() {
  const { matchId } = Route.useParams();
  const match = useMatch(matchId);
  const teams = useTeams();
  const players = usePlayers();
  const members = useTeamMembers();
  const innings = useInnings(matchId);
  const inningsIds = (innings.data ?? []).map((i) => i.id);
  const deliveries = useDeliveries(inningsIds);
  const createInnings = useCreateInnings();
  const updateMatch = useUpdateMatch();
  const { user, isAdmin } = useAuth();
  const canScoreQuery = useCanScore(matchId, {
    userId: user?.id,
    isAdmin,
    matchCreatedBy: match.data?.created_by,
    matchStatus: match.data?.status,
  });
  const qc = useQueryClient();

  // Realtime: every scorer keystroke lands here within a second.
  useEffect(() => {
    if (inningsIds.length === 0) return;
    const channel = supabase
      .channel(`match-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        qc.invalidateQueries({ queryKey: ["deliveries"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        qc.invalidateQueries({ queryKey: ["match", matchId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, inningsIds.length, qc]);

  const name = useMemo(
    () => (id: string | null | undefined) => playerName(players.data, id),
    [players.data],
  );

  if (match.isLoading || teams.isLoading) return <Skeleton className="h-72 rounded-2xl" />;
  if (!match.data)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Match not found.{" "}
          <Link to="/matches" className="underline">
            Back to matches
          </Link>
        </CardContent>
      </Card>
    );

  const m = match.data;
  const teamName = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? "TBD";
  const isManager = Boolean(user && (isAdmin || m.created_by === user.id));
  const canScore = Boolean(canScoreQuery.data);
  const allInnings = innings.data ?? [];
  const allBalls = deliveries.data ?? [];
  const ballsOf = (inn: Innings) => allBalls.filter((d) => d.innings_id === inn.id);

  function startInnings(battingTeamId: string, bowlingTeamId: string, number: number) {
    createInnings.mutate(
      { match_id: matchId, innings_number: number, batting_team_id: battingTeamId, bowling_team_id: bowlingTeamId },
      {
        onSuccess: () => {
          if (m.status !== "live") updateMatch.mutate({ id: matchId, patch: { status: "live" } });
          toast.success(`Innings ${number} started`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const squadOf = (teamId: string) =>
    (players.data ?? []).filter((p) =>
      (members.data ?? []).some((mm) => mm.team_id === teamId && mm.player_id === p.id),
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {teamName(m.team_a_id)} vs {teamName(m.team_b_id)}
            </h1>
            {m.status === "live" && <LiveDot />}
          </div>
          <p className="text-sm text-muted-foreground">
            {m.title ? `${m.title} · ` : ""}
            {m.venue ? `${m.venue} · ` : ""}
            {m.overs_per_innings} overs · {new Date(m.match_date).toLocaleDateString()}
          </p>
          {m.result_text && <p className="mt-1 font-medium text-success">{m.result_text}</p>}
        </div>
        {canScore && allInnings.length > 0 && (
          <Button asChild>
            <Link to="/matches/$matchId/score" params={{ matchId }}>
              Open scoring console
            </Link>
          </Button>
        )}
      </header>

      <LifecycleBar match={m} isManager={isManager} isAdmin={isAdmin} />

      <VerificationChain
        match={m}
        isManager={isManager}
        isAdmin={isAdmin}
        canScore={canScore}
        deliveries={deliveries.data ?? []}
        players={players.data ?? []}
      />

      {isManager && <ScorerAccess matchId={matchId} matchStatus={m.status} userId={user!.id} />}

      {canScore && allInnings.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            <p className="text-sm font-medium">Who bats first?</p>
            <Button variant="outline" onClick={() => startInnings(m.team_a_id, m.team_b_id, 1)} disabled={createInnings.isPending}>
              {teamName(m.team_a_id)}
            </Button>
            <Button variant="outline" onClick={() => startInnings(m.team_b_id, m.team_a_id, 1)} disabled={createInnings.isPending}>
              {teamName(m.team_b_id)}
            </Button>
          </CardContent>
        </Card>
      )}

      {canScore && allInnings.length === 1 && (
        <Card className="shadow-card">
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            <p className="text-sm font-medium">Second innings</p>
            <Button
              variant="outline"
              disabled={createInnings.isPending}
              onClick={() => startInnings(allInnings[0].bowling_team_id, allInnings[0].batting_team_id, 2)}
            >
              Start chase
            </Button>
            <Button variant="ghost" onClick={() => updateMatch.mutate({ id: matchId, patch: { status: "completed" } })}>
              Mark match completed
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="Live">
        <TabsList className="flex w-full flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Overview" className="space-y-3">
          <Card className="shadow-card">
            <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2">
              <Info label="Format" value={m.format ?? m.match_type ?? "—"} />
              <Info label="Ball type" value={m.ball_type ?? "—"} />
              <Info label="Venue" value={m.venue ?? "—"} />
              <Info label="Start time" value={m.start_time ?? "—"} />
              <Info label="Overs per innings" value={String(m.overs_per_innings)} />
              <Info label="Innings" value={String(m.innings_count)} />
              <Info label="State" value={(m.state ?? "DRAFT").replace("_", " ")} />
              <Info label="Status" value={m.status} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Live" className="space-y-4">
          {allInnings.length === 0 && <Empty>No innings started yet.</Empty>}
          {allInnings.map((inn) => {
            const balls = ballsOf(inn);
            const s = summariseInnings(balls);
            return (
              <Card key={inn.id} className="shadow-card">
                <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Innings {inn.innings_number} · {teamName(inn.batting_team_id)}
                    </p>
                    <p className="tabular mt-1 text-4xl font-bold">
                      <StatCounter value={s.runs} />/<StatCounter value={s.wickets} />
                      <span className="ml-3 text-lg text-muted-foreground">{s.overs} OV</span>
                    </p>
                  </div>
                  <div className="tabular text-right text-sm text-muted-foreground">
                    <p>Run rate {s.runRate.toFixed(2)}</p>
                    <p>Extras {s.extras}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="Scorecard" className="space-y-4">
          {allInnings.map((inn) => (
            <section key={inn.id} className="space-y-3">
              <h3 className="text-sm font-semibold">
                Innings {inn.innings_number} · {teamName(inn.batting_team_id)}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <BattingTable balls={ballsOf(inn)} name={name} />
                <BowlingTable balls={ballsOf(inn)} name={name} />
              </div>
            </section>
          ))}
          {allInnings.length === 0 && <Empty>The scorecard builds itself once scoring starts.</Empty>}
        </TabsContent>

        <TabsContent value="Ball-by-Ball" className="space-y-4">
          {allInnings.map((inn) => (
            <Card key={inn.id} className="shadow-card">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-semibold">Innings {inn.innings_number}</p>
                {groupOvers(ballsOf(inn)).map((over) => (
                  <div key={over.number} className="flex flex-wrap items-center gap-1.5">
                    <span className="tabular w-10 text-xs font-semibold text-muted-foreground">
                      Ov {over.number + 1}
                    </span>
                    {over.balls.map((d) => (
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
                ))}
                {ballsOf(inn).length === 0 && <Empty>No deliveries yet.</Empty>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Commentary" className="space-y-3">
          {allInnings.map((inn) => (
            <Card key={inn.id} className="shadow-card">
              <CardContent className="divide-y p-0">
                <p className="px-5 py-3 text-sm font-semibold">Innings {inn.innings_number}</p>
                {commentaryFeed(ballsOf(inn), name).map((line) => (
                  <div key={line.id} className="flex gap-3 px-5 py-2.5 text-sm">
                    <span className="tabular w-12 shrink-0 font-semibold text-muted-foreground">
                      {line.over}
                    </span>
                    <span
                      className={cn(
                        line.tone === "wicket" && "font-semibold text-live",
                        line.tone === "boundary" && "font-semibold text-primary",
                        line.tone === "extra" && "text-muted-foreground",
                      )}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
                {ballsOf(inn).length === 0 && <Empty>Commentary appears ball by ball.</Empty>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Squads">
          <div className="grid gap-3 md:grid-cols-2">
            {[m.team_a_id, m.team_b_id].map((tid) => (
              <SquadList key={tid} title={teamName(tid)} squad={squadOf(tid)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Playing XI">
          <div className="grid gap-3 md:grid-cols-2">
            {[m.team_a_id, m.team_b_id].map((tid) => (
              <SquadList key={tid} title={`${teamName(tid)} XI`} squad={squadOf(tid).slice(0, 11)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Toss">
          <Card className="shadow-card">
            <CardContent className="space-y-1 p-5 text-sm">
              {m.toss_winner_team_id ? (
                <p>
                  <span className="font-semibold">{teamName(m.toss_winner_team_id)}</span> won the toss
                  and chose to <span className="font-semibold">{m.toss_decision ?? "bat"}</span>.
                </p>
              ) : (
                <Empty>Toss not recorded yet.</Empty>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Partnerships" className="space-y-3">
          {allInnings.map((inn) => (
            <Card key={inn.id} className="shadow-card">
              <CardContent className="p-0">
                <Row head cols={["Wkt", "Runs", "Balls", "Batters"]} />
                {partnerships(ballsOf(inn)).map((p) => (
                  <Row
                    key={`${inn.id}-${p.wicket}`}
                    cols={[
                      `${p.wicket}${p.unbroken ? "*" : ""}`,
                      String(p.runs),
                      String(p.balls),
                      p.batters.map(name).join(" & "),
                    ]}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Fall of Wickets" className="space-y-3">
          {allInnings.map((inn) => (
            <Card key={inn.id} className="shadow-card">
              <CardContent className="p-0">
                <Row head cols={["Wkt", "Score", "Over", "Batter"]} />
                {fallOfWickets(ballsOf(inn)).map((f) => (
                  <Row
                    key={`${inn.id}-${f.wicket}`}
                    cols={[String(f.wicket), String(f.runs), f.overs, name(f.playerId)]}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Batting" className="space-y-3">
          {allInnings.map((inn) => (
            <BattingTable key={inn.id} balls={ballsOf(inn)} name={name} />
          ))}
        </TabsContent>

        <TabsContent value="Bowling" className="space-y-3">
          {allInnings.map((inn) => (
            <BowlingTable key={inn.id} balls={ballsOf(inn)} name={name} />
          ))}
        </TabsContent>

        <TabsContent value="Fielding">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Row head cols={["Fielder", "Catches", "Run outs", "Stumpings"]} />
              {fieldingTable(allBalls).map((f) => (
                <Row
                  key={f.playerId}
                  cols={[name(f.playerId), String(f.catches), String(f.runOuts), String(f.stumpings)]}
                />
              ))}
              {fieldingTable(allBalls).length === 0 && <Empty>No fielding dismissals yet.</Empty>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Statistics">
          <Card className="shadow-card">
            <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-3">
              <Info label="Balls bowled" value={String(allBalls.length)} />
              <Info label="Boundaries" value={String(allBalls.filter((d) => d.runs_off_bat === 4).length)} />
              <Info label="Sixes" value={String(allBalls.filter((d) => d.runs_off_bat === 6).length)} />
              <Info label="Dot balls" value={String(allBalls.filter((d) => d.runs_off_bat === 0 && !d.extra_type).length)} />
              <Info label="Extras" value={String(allBalls.reduce((s, d) => s + d.extra_runs, 0))} />
              <Info label="Wickets" value={String(allBalls.filter((d) => d.wicket_type).length)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------- fragments */
const groupOvers = (balls: Delivery[]) => {
  const map = new Map<number, Delivery[]>();
  for (const d of balls) map.set(d.over_number, [...(map.get(d.over_number) ?? []), d]);
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, list]) => ({ number, balls: list }));
};

function fieldingTable(balls: Delivery[]) {
  const map = new Map<string, { playerId: string; catches: number; runOuts: number; stumpings: number }>();
  for (const d of balls)
    for (const c of fieldingCredits(d)) {
      const row = map.get(c.playerId) ?? { playerId: c.playerId, catches: 0, runOuts: 0, stumpings: 0 };
      if (c.kind === "catch") row.catches += 1;
      if (c.kind === "runout") row.runOuts += 1;
      if (c.kind === "stumping") row.stumpings += 1;
      map.set(c.playerId, row);
    }
  return [...map.values()].sort((a, b) => b.catches + b.runOuts + b.stumpings - (a.catches + a.runOuts + a.stumpings));
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="p-4 text-sm text-muted-foreground">{children}</p>
);

const Info = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
    <p className="font-medium capitalize">{value}</p>
  </div>
);

function Row({ cols, head = false }: { cols: string[]; head?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-2 px-4 py-2.5 text-sm",
        `grid-cols-${cols.length}`,
        head
          ? "text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
          : "tabular border-t",
      )}
      style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
    >
      {cols.map((c, i) => (
        <span key={i} className={i === cols.length - 1 ? "truncate" : ""}>
          {c}
        </span>
      ))}
    </div>
  );
}

function SquadList({ title, squad }: { title: string; squad: Player[] }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <p className="px-4 py-3 text-sm font-semibold">{title}</p>
        {squad.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
            <Link to="/players/$playerId" params={{ playerId: p.id }} className="font-medium hover:underline">
              {p.full_name}
            </Link>
            <span className="text-xs text-muted-foreground">{p.role ?? "—"}</span>
          </div>
        ))}
        {squad.length === 0 && <Empty>No squad recorded.</Empty>}
      </CardContent>
    </Card>
  );
}

function BattingTable({
  balls,
  name,
}: {
  balls: Delivery[];
  name: (id: string | null | undefined) => string;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <Row head cols={["Batter", "R", "B", "4s", "6s", "SR"]} />
        {battingCard(balls).map((l) => (
          <Row
            key={l.playerId}
            cols={[
              `${name(l.playerId)}${l.out ? "" : "*"}`,
              String(l.runs),
              String(l.balls),
              String(l.fours),
              String(l.sixes),
              l.strikeRate.toFixed(1),
            ]}
          />
        ))}
        {balls.length === 0 && <Empty>No deliveries yet.</Empty>}
      </CardContent>
    </Card>
  );
}

function BowlingTable({
  balls,
  name,
}: {
  balls: Delivery[];
  name: (id: string | null | undefined) => string;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <Row head cols={["Bowler", "O", "M", "R", "W", "Econ"]} />
        {bowlingCard(balls).map((l) => (
          <Row
            key={l.playerId}
            cols={[
              name(l.playerId),
              l.overs,
              String(l.maidens),
              String(l.runs),
              String(l.wickets),
              l.economy.toFixed(2),
            ]}
          />
        ))}
        {balls.length === 0 && <Empty>No deliveries yet.</Empty>}
      </CardContent>
    </Card>
  );
}

/** Captains/admins grant a player temporary scoring rights for this match only. */
function ScorerAccess({
  matchId,
  matchStatus,
  userId,
}: {
  matchId: string;
  matchStatus: string;
  userId: string;
}) {
  const profiles = useProfiles();
  const permissions = useScoringPermissions(matchId);
  const grant = useGrantScoring();
  const revoke = useRevokeScoring();
  const [pick, setPick] = useState("");

  const active = (permissions.data ?? []).filter((p) => !p.revoked);
  const expired = matchStatus === "completed" || matchStatus === "abandoned";
  const nameOf = (id: string) => profiles.data?.find((p) => p.id === id)?.full_name || "Unknown player";

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">Scoring permission</p>
          <p className="text-xs text-muted-foreground">
            Match-scoped and temporary — it stops working the moment this match is marked completed.
            You keep override rights over every ball.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a player" />
            </SelectTrigger>
            <SelectContent>
              {(profiles.data ?? [])
                .filter((p) => p.status !== "suspended")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || "Unnamed player"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!pick || grant.isPending || expired}
            onClick={() =>
              grant.mutate(
                { matchId, userId: pick, grantedBy: userId },
                {
                  onSuccess: () => toast.success("Scoring access granted"),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            + Add scorer
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {active.length === 0 && <p className="text-xs text-muted-foreground">No scorers assigned yet.</p>}
          {active.map((p) => (
            <Badge key={p.id} variant="secondary" className="gap-2 py-1.5">
              {nameOf(p.user_id)}
              {expired ? (
                <span className="text-muted-foreground">expired</span>
              ) : (
                <button className="underline" onClick={() => revoke.mutate(p.id)} disabled={revoke.isPending}>
                  revoke
                </button>
              )}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LifecycleBar({
  match,
  isManager,
  isAdmin,
}: {
  match: Match;
  isManager: boolean;
  isAdmin: boolean;
}) {
  const advance = useAdvanceMatchState();
  const state = match.state ?? "DRAFT";
  const next = nextMatchState(state);
  // Only an admin may move a submitted match to APPROVED.
  const canAdvance = next && (next === "APPROVED" ? isAdmin : isManager);

  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1">
          {MATCH_FLOW.map((s) => {
            const idx = MATCH_FLOW.indexOf(state);
            const here = MATCH_FLOW.indexOf(s);
            return (
              <Badge
                key={s}
                variant={here === idx ? "default" : "outline"}
                className={here < idx ? "opacity-60" : here > idx ? "opacity-40" : ""}
              >
                {s.replace("_", " ")}
              </Badge>
            );
          })}
        </div>
        {canAdvance && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={advance.isPending}
            onClick={() =>
              advance.mutate(
                { id: match.id, state: next! },
                {
                  onSuccess: () => toast.success(`Match moved to ${next}`),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Advance to {next!.replace("_", " ")}
          </Button>
        )}
        {next === "APPROVED" && !isAdmin && (
          <span className="ml-auto text-xs text-muted-foreground">Awaiting admin approval</span>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Scorer submits → captain verifies → (optionally) admin verifies. Once a match
 * is completed nothing can be edited silently: every change is a request.
 */
function VerificationChain({
  match,
  isManager,
  isAdmin,
  canScore,
  deliveries,
  players,
}: {
  match: Match;
  isManager: boolean;
  isAdmin: boolean;
  canScore: boolean;
  deliveries: Delivery[];
  players: Player[];
}) {
  const submit = useSubmitScorecard();
  const verify = useVerifyScorecard();
  const setRequired = useSetAdminVerificationRequired();
  const file = useFileCorrection();
  const requests = useCorrectionRequests(match.id);

  const [deliveryId, setDeliveryId] = useState("");
  const [field, setField] = useState<string>(CORRECTABLE_FIELDS[0]);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const completed = ["COMPLETED", "VERIFIED", "ARCHIVED"].includes(match.state);
  if (!completed && !(canScore && match.state === "LIVE")) return null;

  const official = statsOfficial(match);
  const chosen = deliveries.find((d) => d.id === deliveryId);
  const currentValue = chosen ? String((chosen as unknown as Record<string, unknown>)[field] ?? "") : "";
  const recent = [...deliveries].slice(-40).reverse();
  const mine = requests.data ?? [];

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Verification chain</p>
            <p className="text-sm text-muted-foreground">
              {official
                ? "Verified — these statistics are official."
                : match.state === "COMPLETED"
                  ? "Awaiting verification. Stats stay provisional until signed off."
                  : "Submit the scorecard when the match finishes."}
            </p>
          </div>
          <Badge variant={official ? "default" : "secondary"}>
            {official ? "Official" : "Provisional"}
          </Badge>
        </div>

        <ol className="grid gap-2 sm:grid-cols-3">
          <Step
            n={1}
            label="Scorer submitted"
            done={Boolean(match.submitted_at)}
            at={match.submitted_at}
          />
          <Step
            n={2}
            label="Captain verified"
            done={Boolean(match.verified_at)}
            at={match.verified_at}
          />
          <Step
            n={3}
            label={match.requires_admin_verification ? "Admin verified" : "Admin sign-off not required"}
            done={Boolean(match.admin_verified_at) || !match.requires_admin_verification}
            at={match.admin_verified_at}
          />
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          {canScore && match.state === "LIVE" && (
            <Button
              size="sm"
              onClick={() =>
                submit.mutate(match.id, {
                  onSuccess: () => toast.success("Scorecard submitted for verification"),
                  onError: (e) => toast.error(e.message),
                })
              }
              disabled={submit.isPending}
            >
              Submit scorecard
            </Button>
          )}
          {isManager && match.state === "COMPLETED" && !match.verified_at && (
            <Button
              size="sm"
              onClick={() =>
                verify.mutate(
                  { matchId: match.id },
                  {
                    onSuccess: () => toast.success("Scorecard verified"),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
              disabled={verify.isPending}
            >
              Verify as captain
            </Button>
          )}
          {isAdmin && match.requires_admin_verification && !match.admin_verified_at && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                verify.mutate(
                  { matchId: match.id, asAdmin: true },
                  { onSuccess: () => toast.success("Admin verification recorded") },
                )
              }
            >
              Admin verify
            </Button>
          )}
          {isAdmin && (
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Switch
                checked={Boolean(match.requires_admin_verification)}
                onCheckedChange={(v) => setRequired.mutate({ matchId: match.id, required: v })}
              />
              High-stakes match
            </label>
          )}
        </div>

        {completed && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Request a correction</p>
            <p className="text-xs text-muted-foreground">
              Completed data can't be edited directly. Corrections are reviewed by an admin and
              recorded in the audit trail.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Select value={deliveryId} onValueChange={setDeliveryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Delivery" />
                </SelectTrigger>
                <SelectContent>
                  {recent.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.over_number}.{d.ball_number} · {playerName(players, d.striker_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={field} onValueChange={setField}>
                <SelectTrigger>
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTABLE_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Label className="sr-only">New value</Label>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={currentValue ? `now: ${currentValue}` : "New value"}
                />
              </div>
            </div>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this need changing?"
              rows={2}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!deliveryId || !reason.trim() || file.isPending}
              onClick={() =>
                file.mutate(
                  {
                    match_id: match.id,
                    delivery_id: deliveryId,
                    field,
                    current_value: currentValue,
                    requested_value: value,
                    reason: reason.trim(),
                  },
                  {
                    onSuccess: () => {
                      toast.success("Correction request filed");
                      setReason("");
                      setValue("");
                      setDeliveryId("");
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              File correction request
            </Button>

            {mine.length > 0 && (
              <div className="space-y-1">
                {mine.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs"
                  >
                    <span className="truncate">
                      {r.field} → {r.requested_value || "—"} · {r.reason}
                    </span>
                    <Badge variant={r.status === "pending" ? "secondary" : "outline"}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Step({
  n,
  label,
  done,
  at,
}: {
  n: number;
  label: string;
  done: boolean;
  at?: string | null;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        done ? "border-primary/40 bg-primary/5" : "border-dashed text-muted-foreground",
      )}
    >
      <span className="mr-2 font-mono text-xs opacity-60">{n}</span>
      {label}
      {at && (
        <span className="block text-[11px] opacity-70">{new Date(at).toLocaleString()}</span>
      )}
    </li>
  );
}
