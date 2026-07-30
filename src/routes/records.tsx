import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllDeliveries, useAllInnings, usePlayers, useTeams } from "@/features/api";
import { useTeamStats } from "@/features/competitions";
import { battingRecords, bowlingRecords, inningsTotals } from "@/lib/stats";
import type { UUID } from "@/lib/types";

export const Route = createFileRoute("/records")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Records — WicketWise" },
      {
        name: "description",
        content: "Club batting, bowling and team records, computed from every delivery ever bowled.",
      },
      { property: "og:title", content: "Records — WicketWise" },
      { property: "og:description", content: "Highest scores, best figures and biggest wins." },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const players = usePlayers();
  const teams = useTeams();
  const deliveries = useAllDeliveries();
  const innings = useAllInnings();
  const teamStats = useTeamStats();

  if (players.isLoading || deliveries.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  const index: Record<UUID, UUID> = Object.fromEntries(
    (innings.data ?? []).map((i) => [i.id, i.match_id]),
  );
  const ids = (players.data ?? []).map((p) => p.id);
  const bat = battingRecords(deliveries.data ?? [], ids, index);
  const bowl = bowlingRecords(deliveries.data ?? [], ids, index);
  const nameOf = (id?: string) => players.data?.find((p) => p.id === id)?.full_name ?? "Unknown";
  const teamName = (id?: string) => teams.data?.find((t) => t.id === id)?.name ?? "Team";

  const totals = inningsTotals(deliveries.data ?? [], innings.data ?? []).filter((t) => t.legalBalls > 0);
  const highestTotal = [...totals].sort((a, b) => b.runs - a.runs).slice(0, 5);
  const lowestTotal = [...totals].sort((a, b) => a.runs - b.runs).slice(0, 5);
  const stats = teamStats.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Records</h1>
        <p className="text-sm text-muted-foreground">
          Every record is recomputed from the deliveries table — nothing is entered by hand.
        </p>
      </header>

      <Tabs defaultValue="batting">
        <TabsList>
          <TabsTrigger value="batting">Batting</TabsTrigger>
          <TabsTrigger value="bowling">Bowling</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="batting" className="grid gap-3 md:grid-cols-2">
          <Board title="Highest score" rows={bat.highestScore.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Most runs" rows={bat.mostRuns.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Most fifty-plus scores" rows={bat.mostFifties.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Most hundreds" rows={bat.mostHundreds.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Best strike rate (30+ balls)" rows={bat.bestStrikeRate.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
        </TabsContent>

        <TabsContent value="bowling" className="grid gap-3 md:grid-cols-2">
          <Board title="Most wickets" rows={bowl.mostWickets.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Best figures" rows={bowl.bestFigures.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Most five-wicket hauls" rows={bowl.mostFiveFors.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
          <Board title="Best economy (5+ overs)" rows={bowl.bestEconomy.map((r) => [nameOf(r.playerId), r.value, r.playerId!])} />
        </TabsContent>

        <TabsContent value="team" className="grid gap-3 md:grid-cols-2">
          <Board
            title="Highest total"
            rows={highestTotal.map((t) => [teamName(t.batting_team_id), `${t.runs}/${t.wickets}`])}
          />
          <Board
            title="Lowest total"
            rows={lowestTotal.map((t) => [teamName(t.batting_team_id), `${t.runs}/${t.wickets}`])}
          />
          <Board
            title="Most wins"
            rows={[...stats]
              .sort((a, b) => b.won - a.won)
              .slice(0, 5)
              .map((t) => [t.name ?? teamName(t.team_id), String(t.won)])}
          />
          <Board
            title="Best win percentage"
            rows={[...stats]
              .sort((a, b) => b.win_pct - a.win_pct)
              .slice(0, 5)
              .map((t) => [t.name ?? teamName(t.team_id), `${Number(t.win_pct ?? 0).toFixed(1)}%`])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Board({ title, rows }: { title: string; rows: (string | undefined)[][] }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        {rows.map(([label, value, playerId], i) => (
          <div key={`${label}-${i}`} className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
            {playerId ? (
              <Link to="/players/$playerId" params={{ playerId }} className="font-medium hover:underline">
                {label}
              </Link>
            ) : (
              <span className="font-medium">{label}</span>
            )}
            <span className="tabular font-semibold">{value}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing recorded yet.</p>}
      </CardContent>
    </Card>
  );
}
