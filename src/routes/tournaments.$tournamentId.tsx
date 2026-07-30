import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatches, useTeams } from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import {
  useAddTournamentTeam,
  useReviewCompetition,
  useTournament,
  useTournamentPoints,
  useTournamentTeams,
  useUpdateTournament,
} from "@/features/competitions";

export const Route = createFileRoute("/tournaments/$tournamentId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tournament table — WicketWise" },
      { name: "description", content: "Points table with wins, losses, no-results and NRR." },
      { property: "og:title", content: "Tournament table — WicketWise" },
      { property: "og:description", content: "Live standings computed from ball-by-ball data." },
    ],
  }),
  component: TournamentDetail,
});

function TournamentDetail() {
  const { tournamentId } = Route.useParams();
  const tournament = useTournament(tournamentId);
  const points = useTournamentPoints(tournamentId);
  const entries = useTournamentTeams(tournamentId);
  const addTeam = useAddTournamentTeam();
  const update = useUpdateTournament();
  const review = useReviewCompetition();
  const matches = useMatches();
  const teams = useTeams();
  const { user, isAdmin } = useAuth();

  const [teamId, setTeamId] = useState("");
  const [group, setGroup] = useState("");

  if (tournament.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const t = tournament.data;
  if (!t)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Tournament not found.{" "}
          <Link to="/tournaments" className="underline">
            Back to tournaments
          </Link>
        </CardContent>
      </Card>
    );

  const owner = t.created_by === user?.id;
  const teamName = (id: string) => teams.data?.find((x) => x.id === id)?.name ?? "TBD";
  const fixtures = (matches.data ?? []).filter((m) => m.tournament_id === tournamentId);
  const rows = [...(points.data ?? [])].sort(
    (a, b) => b.points - a.points || b.nrr - a.nrr,
  );
  const groups = [...new Set(rows.map((r) => r.group_name ?? ""))];
  const available = (teams.data ?? []).filter(
    (x) => !(entries.data ?? []).some((e) => e.team_id === x.id),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t.format.replace("_", " + ")} · {t.team_count} teams · {t.venue || "Venue TBD"} ·{" "}
            {t.points_per_win}/{t.points_per_tie}/{t.points_per_loss} pts (W/T/L)
          </p>
        </div>
        <Badge variant="outline" className="ml-auto capitalize">
          {t.approval_status.replace("_", " ")}
        </Badge>
      </header>

      {t.review_note && (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-4 text-sm">Admin note: {t.review_note}</CardContent>
        </Card>
      )}

      {(owner || isAdmin) && (
        <div className="flex flex-wrap gap-2">
          {owner && t.approval_status === "draft" && (
            <Button
              size="sm"
              onClick={() =>
                update.mutate(
                  { id: tournamentId, patch: { approval_status: "submitted" } },
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
                    { table: "tournaments", id: tournamentId, status },
                    {
                      onSuccess: () => toast.success(`Tournament ${status.replace("_", " ")}`),
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

      {(owner || isAdmin) && (
        <Card className="shadow-card">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-48 flex-1">
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a team" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {t.format !== "knockout" && (
              <Input
                className="w-32"
                placeholder="Group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />
            )}
            <Button
              disabled={!teamId || addTeam.isPending}
              onClick={() =>
                addTeam.mutate(
                  { tournament_id: tournamentId, team_id: teamId, group_name: group || null },
                  {
                    onSuccess: () => {
                      setTeamId("");
                      setGroup("");
                      toast.success("Team entered");
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Enter team
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Points table</h2>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            The table fills in as matches are scored ball by ball.
          </p>
        )}
        {groups.map((g) => (
          <Card key={g} className="shadow-card">
            <CardContent className="overflow-x-auto p-0">
              {g && (
                <p className="px-4 pt-3 text-sm font-semibold">Group {g}</p>
              )}
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    {["Team", "P", "W", "L", "T", "NR", "Pts", "NRR"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows
                    .filter((r) => (r.group_name ?? "") === g)
                    .map((r) => (
                      <tr key={r.team_id}>
                        <td className="px-4 py-2 font-medium">{teamName(r.team_id)}</td>
                        <td className="px-4 py-2">{r.played}</td>
                        <td className="px-4 py-2">{r.won}</td>
                        <td className="px-4 py-2">{r.lost}</td>
                        <td className="px-4 py-2">{r.tied}</td>
                        <td className="px-4 py-2">{r.no_result}</td>
                        <td className="px-4 py-2 font-semibold">{r.points}</td>
                        <td className="px-4 py-2">{r.nrr > 0 ? `+${r.nrr}` : r.nrr}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fixtures</h2>
        {fixtures.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create matches and attach them to this tournament.
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
                  {m.stage || "Group stage"} · {new Date(m.match_date).toLocaleDateString()}
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
