import { createFileRoute, Link } from "@tanstack/react-router";

import { StatCounter } from "@/components/stat-counter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllDeliveries, useAllInnings, useMatches, usePlayers, useTeamMembers, useTeams } from "@/features/api";
import { achievementsFor } from "@/lib/achievements";
import { battingForm, bowlingForm, fieldingStats, fullBatting, fullBowling } from "@/lib/stats";
import type { UUID } from "@/lib/types";

export const Route = createFileRoute("/players/$playerId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Player profile — WicketWise" },
      { name: "description", content: "Career batting, bowling and fielding record, derived ball by ball." },
      { property: "og:title", content: "Player profile — WicketWise" },
      { property: "og:description", content: "Career record derived from every delivery bowled." },
    ],
  }),
  component: PlayerProfile,
});

function PlayerProfile() {
  const { playerId } = Route.useParams();
  const players = usePlayers();
  const deliveries = useAllDeliveries();
  const innings = useAllInnings();
  const matches = useMatches();
  const teams = useTeams();
  const members = useTeamMembers();

  const index: Record<UUID, UUID> = Object.fromEntries(
    (innings.data ?? []).map((i) => [i.id, i.match_id]),
  );
  const balls = deliveries.data ?? [];
  const player = players.data?.find((p) => p.id === playerId);
  const bat = fullBatting(balls, playerId, index);
  const bowl = fullBowling(balls, playerId, index);
  const field = fieldingStats(balls, playerId);
  const myTeams = (teams.data ?? []).filter((t) =>
    (members.data ?? []).some((m) => m.team_id === t.id && m.player_id === playerId),
  );
  const isCaptain = myTeams.some((t) => t.captain_player_id === playerId);
  const badges = achievementsFor(balls, playerId, index, { isCaptain });
  const myMatchIds = new Set([...bat.entries, ...bowl.entries].map((e) => e.matchId));
  const myMatches = (matches.data ?? []).filter((m) => myMatchIds.has(m.id));

  if (players.isLoading || deliveries.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!player)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Player not found.{" "}
          <Link to="/players" className="underline">
            Back to players
          </Link>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.full_name} className="size-16 rounded-full object-cover" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {player.full_name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{player.full_name}</h1>
            {isCaptain && <Badge className="bg-gold text-black">Captain</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[player.role, player.batting_style, player.bowling_style].filter(Boolean).join(" · ") ||
              "No style recorded"}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Matches" value={Math.max(bat.matches, bowl.matches)} />
        <Stat label="Runs" value={bat.runs} />
        <Stat label="Wickets" value={bowl.wickets} />
        <Stat label="Catches" value={field.catches} />
      </div>

      <Tabs defaultValue="Overview">
        <TabsList className="flex flex-wrap justify-start">
          {["Overview", "Batting", "Bowling", "Fielding", "Matches", "Teams", "Achievements"].map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Overview" className="space-y-3">
          <Card className="shadow-card">
            <CardContent className="space-y-3 p-5 text-sm">
              <Line label="Batting form (last 5)" value={battingForm(balls, playerId, index).join(", ") || "—"} />
              <Line label="Bowling form (last 5)" value={bowlingForm(balls, playerId, index).join(", ") || "—"} />
              <Line label="Batting average" value={bat.average === null ? "—" : bat.average.toFixed(2)} />
              <Line label="Bowling economy" value={bowl.legalBalls ? bowl.economy.toFixed(2) : "—"} />
              <p className="text-xs text-muted-foreground">
                Every figure is recalculated from the deliveries table — nothing here is entered by hand.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Batting">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Innings" value={bat.innings} />
            <Stat label="Runs" value={bat.runs} />
            <Stat label="Balls" value={bat.balls} />
            <Stat label="Not outs" value={bat.notOuts} />
            <Stat label="Average" value={bat.average ?? 0} decimals={2} suffix={bat.average === null ? "*" : ""} />
            <Stat label="Strike rate" value={bat.strikeRate} decimals={1} />
            <Stat label="Fifties" value={bat.fifties} />
            <Stat label="Hundreds" value={bat.hundreds} />
            <Stat label="Fours" value={bat.fours} />
            <Stat label="Sixes" value={bat.sixes} />
            <Stat label="High score" value={bat.highScore} suffix={bat.highScoreNotOut ? "*" : ""} />
            <Stat label="Matches" value={bat.matches} />
          </div>
        </TabsContent>

        <TabsContent value="Bowling">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Innings" value={bowl.innings} />
            <Stat label="Wickets" value={bowl.wickets} />
            <Stat label="Runs conceded" value={bowl.runs} />
            <Stat label="Maidens" value={bowl.maidens} />
            <Stat label="Economy" value={bowl.economy} decimals={2} />
            <Stat label="Average" value={bowl.average ?? 0} decimals={2} suffix={bowl.average === null ? "*" : ""} />
            <Stat label="Strike rate" value={bowl.strikeRate ?? 0} decimals={1} suffix={bowl.strikeRate === null ? "*" : ""} />
            <Stat label="Five-fors" value={bowl.fiveFors} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Overs bowled: {bowl.overs} · Best figures:{" "}
            {bowl.best ? `${bowl.best.wickets}/${bowl.best.runs}` : "—"}
          </p>
        </TabsContent>

        <TabsContent value="Fielding">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Catches" value={field.catches} />
            <Stat label="Run outs" value={field.runOuts} />
            <Stat label="Stumpings" value={field.stumpings} />
            <Stat label="Total dismissals" value={field.total} />
          </div>
        </TabsContent>

        <TabsContent value="Matches">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {myMatches.map((m) => (
                <Link
                  key={m.id}
                  to="/matches/$matchId"
                  params={{ matchId: m.id }}
                  className="flex items-center justify-between border-t px-4 py-3 text-sm first:border-t-0 hover:bg-muted/50"
                >
                  <span className="font-medium">{m.title ?? "Match"}</span>
                  <span className="text-muted-foreground">{new Date(m.match_date).toLocaleDateString()}</span>
                </Link>
              ))}
              {myMatches.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No matches played yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Teams">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {myTeams.map((t) => (
                <Link
                  key={t.id}
                  to="/teams/$teamId"
                  params={{ teamId: t.id }}
                  className="flex items-center justify-between border-t px-4 py-3 text-sm first:border-t-0 hover:bg-muted/50"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground">{t.city ?? ""}</span>
                </Link>
              ))}
              {myTeams.length === 0 && <p className="p-4 text-sm text-muted-foreground">No teams yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Achievements">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {badges.map((b) => (
              <Card key={b.code} className={b.earned ? "border-gold/60 shadow-card" : "opacity-70 shadow-none"}>
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{b.label}</p>
                    {b.earned && <Badge className="bg-gold text-black">Earned</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{b.description}</p>
                  <p className="tabular text-xs">
                    {Math.min(b.progress, b.target)} / {b.target}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  decimals = 0,
  suffix = "",
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="tabular mt-1 text-2xl font-bold">
          <StatCounter value={value} decimals={decimals} />
          {suffix}
        </p>
      </CardContent>
    </Card>
  );
}
