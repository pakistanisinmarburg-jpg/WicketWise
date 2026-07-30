import { createFileRoute, Link } from "@tanstack/react-router";

import { LiveDot } from "@/components/stat-counter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllDeliveries, useAllInnings, useMatches, useTeams } from "@/features/api";
import { summariseInnings } from "@/lib/cricket";

export const Route = createFileRoute("/live")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Live matches — WicketWise" },
      {
        name: "description",
        content: "Every match being scored right now, updating ball by ball without a refresh.",
      },
      { property: "og:title", content: "Live matches — WicketWise" },
      { property: "og:description", content: "Follow the scores as they happen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  const matches = useMatches();
  const teams = useTeams();
  const innings = useAllInnings();
  const deliveries = useAllDeliveries();

  if (matches.isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  const live = (matches.data ?? []).filter(
    (m) => m.state === "LIVE" || m.status === "live",
  );
  const teamName = (id?: string | null) =>
    teams.data?.find((t) => t.id === id)?.short_name ??
    teams.data?.find((t) => t.id === id)?.name ??
    "TBD";

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Live matches</h1>
        {live.length > 0 && <LiveDot label={`${live.length} in play`} />}
      </header>

      {live.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nothing is being scored right now.{" "}
            <Link to="/matches" className="underline">
              Browse all matches
            </Link>
            .
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {live.map((m) => {
          const ids = (innings.data ?? []).filter((i) => i.match_id === m.id);
          const current = ids[ids.length - 1];
          const balls = (deliveries.data ?? []).filter((d) => d.innings_id === current?.id);
          const s = summariseInnings(balls);
          return (
            <Link key={m.id} to="/matches/$matchId" params={{ matchId: m.id }}>
              <Card className="shadow-card transition-shadow hover:shadow-lg">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">
                      {teamName(m.team_a_id)} v {teamName(m.team_b_id)}
                    </p>
                    <LiveDot />
                  </div>
                  <p className="tabular text-3xl font-bold">
                    {s.runs}/{s.wickets}
                    <span className="ml-2 text-base font-medium text-muted-foreground">
                      {s.overs} ov
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.venue ?? "Venue TBC"} · RR {s.runRate.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
