import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatches, useTeams } from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import {
  useReviewCompetition,
  useSeries,
  useSeriesStandings,
  useUpdateSeries,
} from "@/features/competitions";

export const Route = createFileRoute("/series/$seriesId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Series standings — WicketWise" },
      { name: "description", content: "Series fixtures and auto-calculated standings." },
      { property: "og:title", content: "Series standings — WicketWise" },
      { property: "og:description", content: "Points, wins and run rate across the series." },
    ],
  }),
  component: SeriesDetail,
});

function SeriesDetail() {
  const { seriesId } = Route.useParams();
  const series = useSeries(seriesId);
  const standings = useSeriesStandings(seriesId);
  const matches = useMatches();
  const teams = useTeams();
  const update = useUpdateSeries();
  const review = useReviewCompetition();
  const { user, isAdmin } = useAuth();

  if (series.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const s = series.data;
  if (!s)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Series not found.{" "}
          <Link to="/series" className="underline">
            Back to series
          </Link>
        </CardContent>
      </Card>
    );

  const owner = s.created_by === user?.id;
  const teamName = (id: string | null) =>
    id ? (teams.data?.find((t) => t.id === id)?.name ?? "TBD") : "TBD";
  const fixtures = (matches.data ?? []).filter((m) => m.series_id === seriesId);
  const rows = [...(standings.data ?? [])].sort(
    (a, b) => b.points - a.points || b.run_rate - a.run_rate,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{s.name}</h1>
          <p className="text-sm text-muted-foreground">
            {teamName(s.team_a_id)} vs {teamName(s.team_b_id)} · best of {s.match_count} ·{" "}
            {s.points_per_win} pts per win
          </p>
        </div>
        <Badge variant="outline" className="ml-auto capitalize">
          {s.approval_status.replace("_", " ")}
        </Badge>
      </header>

      {s.review_note && (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-4 text-sm">Admin note: {s.review_note}</CardContent>
        </Card>
      )}

      {(owner || isAdmin) && (
        <div className="flex flex-wrap gap-2">
          {owner && s.approval_status === "draft" && (
            <Button
              size="sm"
              onClick={() =>
                update.mutate(
                  { id: seriesId, patch: { approval_status: "submitted" } },
                  {
                    onSuccess: () => toast.success("Submitted for admin approval"),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Submit for approval
            </Button>
          )}
          {isAdmin &&
            (["approved", "rejected", "changes_requested"] as const).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "approved" ? "default" : "outline"}
                onClick={() =>
                  review.mutate(
                    { table: "series", id: seriesId, status },
                    {
                      onSuccess: () => toast.success(`Series ${status.replace("_", " ")}`),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                {status.replace("_", " ")}
              </Button>
            ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Standings</h2>
        <Card className="shadow-card">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {["Team", "P", "W", "L", "T", "NR", "Pts", "RR"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                      Standings appear once matches are scored.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.team_id}>
                    <td className="px-4 py-2 font-medium">{teamName(r.team_id)}</td>
                    <td className="px-4 py-2">{r.played}</td>
                    <td className="px-4 py-2">{r.won}</td>
                    <td className="px-4 py-2">{r.lost}</td>
                    <td className="px-4 py-2">{r.tied}</td>
                    <td className="px-4 py-2">{r.no_result}</td>
                    <td className="px-4 py-2 font-semibold">{r.points}</td>
                    <td className="px-4 py-2">{r.run_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fixtures</h2>
        {fixtures.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create matches and attach them to this series.
          </p>
        )}
        {fixtures.map((m) => (
          <Link key={m.id} to="/matches/$matchId" params={{ matchId: m.id }}>
            <Card className="shadow-card transition-shadow hover:shadow-lift">
              <CardContent className="flex items-center gap-3 p-4 text-sm">
                <span className="font-medium">
                  {teamName(m.team_a_id)} vs {teamName(m.team_b_id)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.match_date).toLocaleDateString()}
                </span>
                <Badge variant="outline" className="ml-auto">
                  {m.state}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
