import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatches, useTeams } from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import { useMyScoringAssignments } from "@/features/scoring-assignments";

export const Route = createFileRoute("/scoring")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Assigned matches — WicketWise" },
      {
        name: "description",
        content: "Matches you can score, opening straight into the live scoring console.",
      },
      { property: "og:title", content: "Assigned matches — WicketWise" },
      { property: "og:description", content: "Your scoring assignments." },
    ],
  }),
  component: ScoringPage,
});

function ScoringPage() {
  const { user, isAdmin, isCaptain } = useAuth();
  const assignments = useMyScoringAssignments(user?.id);
  const matches = useMatches();
  const teams = useTeams();

  if (!user)
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="underline">
            Sign in
          </Link>{" "}
          to see your scoring assignments.
        </CardContent>
      </Card>
    );

  if (assignments.isLoading || matches.isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  const assignedIds = new Set((assignments.data ?? []).map((a) => a.match_id));
  const all = matches.data ?? [];
  const mine = all.filter(
    (m) =>
      assignedIds.has(m.id) ||
      ((isAdmin || isCaptain) && m.created_by === user.id) ||
      (isAdmin && m.state === "LIVE"),
  );
  const teamName = (id?: string | null) =>
    teams.data?.find((t) => t.id === id)?.short_name ??
    teams.data?.find((t) => t.id === id)?.name ??
    "TBD";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Assigned matches</h1>
        <p className="text-sm text-muted-foreground">
          Tap a match to open the scoring console. Access ends automatically once it is completed.
        </p>
      </header>

      {mine.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-2 size-6 opacity-40" />
            No scoring assignments yet. A captain grants access from the match centre.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {mine.map((m) => {
          const scorable = m.state === "LIVE";
          return (
            <Card key={m.id} className="shadow-card">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.title || `${teamName(m.team_a_id)} v ${teamName(m.team_b_id)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.match_date).toLocaleDateString()} · {m.venue ?? "Venue TBC"} ·{" "}
                    {m.state}
                  </p>
                </div>
                <Button asChild size="sm" variant={scorable ? "default" : "outline"}>
                  <Link to="/matches/$matchId/score" params={{ matchId: m.id }}>
                    {scorable ? (
                      <>
                        <Radio className="size-4" /> Score
                      </>
                    ) : (
                      "Open"
                    )}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
