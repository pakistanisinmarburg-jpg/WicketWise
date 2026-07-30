import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllDeliveries, useAllInnings, usePlayers, useTeams } from "@/features/api";
import { useTeamStats } from "@/features/competitions";
import {
  DEFAULT_BATTING_WEIGHTS,
  DEFAULT_BOWLING_WEIGHTS,
  allRounderRating,
  battingRating,
  bowlingRating,
  ratePlayers,
  type RankingWeights,
} from "@/lib/rankings";
import type { UUID } from "@/lib/types";

export const Route = createFileRoute("/rankings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rankings — WicketWise" },
      {
        name: "description",
        content: "Batting, bowling, all-rounder and team leaderboards from a tunable rating formula.",
      },
      { property: "og:title", content: "Rankings — WicketWise" },
      { property: "og:description", content: "Who is leading the club this season?" },
    ],
  }),
  component: RankingsPage,
});

const KEYS: (keyof RankingWeights)[] = ["average", "strikeRate", "volume", "recentForm", "matches"];
const LABEL: Record<keyof RankingWeights, string> = {
  average: "Average",
  strikeRate: "Strike rate / economy",
  volume: "Career volume",
  recentForm: "Recent form",
  matches: "Matches played",
};

function RankingsPage() {
  const players = usePlayers();
  const deliveries = useAllDeliveries();
  const innings = useAllInnings();
  const teamStats = useTeamStats();
  const teams = useTeams();
  const [batW, setBatW] = useState(DEFAULT_BATTING_WEIGHTS);
  const [bowlW, setBowlW] = useState(DEFAULT_BOWLING_WEIGHTS);

  if (players.isLoading || deliveries.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  const index: Record<UUID, UUID> = Object.fromEntries(
    (innings.data ?? []).map((i) => [i.id, i.match_id]),
  );
  const rated = ratePlayers(deliveries.data ?? [], (players.data ?? []).map((p) => p.id), index);
  const nameOf = (id: string) => players.data?.find((p) => p.id === id)?.full_name ?? "Unknown";

  const batting = [...rated]
    .map((p) => ({ p, rating: battingRating(p, batW) }))
    .filter((r) => r.p.batting.innings > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 25);
  const bowling = [...rated]
    .map((p) => ({ p, rating: bowlingRating(p, bowlW) }))
    .filter((r) => r.p.bowling.innings > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 25);
  const allRounders = [...rated]
    .map((p) => ({ p, rating: allRounderRating(p, batW, bowlW) }))
    .filter((r) => r.p.batting.innings > 0 && r.p.bowling.innings > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 25);
  const teamRows = [...(teamStats.data ?? [])].sort((a, b) => b.win_pct - a.win_pct || b.won - a.won);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-sm text-muted-foreground">
            One configurable formula drives every board — tune the weights and the tables re-rank live.
          </p>
        </div>
        <Link to="/records" className="text-sm font-medium text-primary underline">
          See club records →
        </Link>
      </header>

      <Tabs defaultValue="batting">
        <TabsList>
          <TabsTrigger value="batting">Batting</TabsTrigger>
          <TabsTrigger value="bowling">Bowling</TabsTrigger>
          <TabsTrigger value="allround">All-rounder</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="batting" className="space-y-3">
          <Weights title="Batting weights" value={batW} onChange={setBatW} />
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Head cols={["#", "Player", "Rating", "Runs", "Avg", "SR"]} />
              {batting.map((r, i) => (
                <RowLink key={r.p.playerId} playerId={r.p.playerId}>
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium">{nameOf(r.p.playerId)}</span>
                  <span className="font-semibold text-primary">{r.rating.toFixed(1)}</span>
                  <span>{r.p.batting.runs}</span>
                  <span>{r.p.batting.average === null ? "—" : r.p.batting.average.toFixed(2)}</span>
                  <span>{r.p.batting.strikeRate.toFixed(1)}</span>
                </RowLink>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bowling" className="space-y-3">
          <Weights title="Bowling weights" value={bowlW} onChange={setBowlW} />
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Head cols={["#", "Player", "Rating", "Wkts", "Overs", "Econ"]} />
              {bowling.map((r, i) => (
                <RowLink key={r.p.playerId} playerId={r.p.playerId}>
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium">{nameOf(r.p.playerId)}</span>
                  <span className="font-semibold text-primary">{r.rating.toFixed(1)}</span>
                  <span>{r.p.bowling.wickets}</span>
                  <span>{r.p.bowling.overs}</span>
                  <span>{r.p.bowling.economy.toFixed(2)}</span>
                </RowLink>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allround">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Head cols={["#", "Player", "Rating", "Runs", "Wkts", "Catches"]} />
              {allRounders.map((r, i) => (
                <RowLink key={r.p.playerId} playerId={r.p.playerId}>
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium">{nameOf(r.p.playerId)}</span>
                  <span className="font-semibold text-primary">{r.rating.toFixed(1)}</span>
                  <span>{r.p.batting.runs}</span>
                  <span>{r.p.bowling.wickets}</span>
                  <span>{r.p.fielding.catches}</span>
                </RowLink>
              ))}
              {allRounders.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  No player has both batted and bowled yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Head cols={["#", "Team", "P", "W", "L", "Win %"]} />
              {teamRows.map((t, i) => (
                <div key={t.team_id} className="tabular grid grid-cols-6 gap-2 border-t px-4 py-3 text-sm">
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium">
                    {t.name ?? teams.data?.find((x) => x.id === t.team_id)?.name ?? "Team"}
                  </span>
                  <span>{t.played}</span>
                  <span>{t.won}</span>
                  <span>{t.lost}</span>
                  <span className="font-semibold">{Number(t.win_pct ?? 0).toFixed(1)}%</span>
                </div>
              ))}
              {teamRows.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No completed matches yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Weights({
  title,
  value,
  onChange,
}: {
  title: string;
  value: RankingWeights;
  onChange: (w: RankingWeights) => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:col-span-5">
          {title}
        </p>
        {KEYS.map((k) => (
          <div key={k} className="space-y-2">
            <Label className="flex items-center justify-between text-xs">
              {LABEL[k]}
              <span className="tabular text-muted-foreground">{value[k].toFixed(2)}</span>
            </Label>
            <Slider
              value={[value[k] * 100]}
              max={100}
              step={5}
              onValueChange={([v]) => onChange({ ...value, [k]: v / 100 })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RowLink({ playerId, children }: { playerId: string; children: React.ReactNode }) {
  return (
    <Link
      to="/players/$playerId"
      params={{ playerId }}
      className="tabular grid grid-cols-6 gap-2 border-t px-4 py-3 text-sm hover:bg-muted/50"
    >
      {children}
    </Link>
  );
}

function Head({ cols }: { cols: string[] }) {
  return (
    <div className="grid grid-cols-6 gap-2 px-4 py-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {cols.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}
