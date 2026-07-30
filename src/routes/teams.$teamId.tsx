import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAllDeliveries,
  useMatches,
  usePlayers,
  useTeamMembers,
  useTeams,
} from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import {
  useInvitePlayer,
  useRespondInvitation,
  useSeriesList,
  useTeamInvitations,
  useTeamStats,
  useTournaments,
  useTournamentTeams,
} from "@/features/competitions";
import { useProfiles } from "@/features/people";
import { careerBatting, careerBowling } from "@/lib/cricket";
import type { Player, Profile } from "@/lib/types";

export const Route = createFileRoute("/teams/$teamId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Team profile — WicketWise" },
      { name: "description", content: "Squad, fixtures, statistics and trophies." },
      { property: "og:title", content: "Team profile — WicketWise" },
      { property: "og:description", content: "See who plays for this team and how they perform." },
    ],
  }),
  component: TeamDetail,
});

const TABS = [
  "Overview",
  "Squad",
  "Matches",
  "Players",
  "Statistics",
  "Trophies",
  "Series",
  "Tournaments",
] as const;

function TeamDetail() {
  const { teamId } = Route.useParams();
  const teams = useTeams();
  const players = usePlayers();
  const profiles = useProfiles();
  const members = useTeamMembers();
  const matches = useMatches();
  const deliveries = useAllDeliveries();
  const stats = useTeamStats();
  const invitations = useTeamInvitations(teamId);
  const invite = useInvitePlayer();
  const respond = useRespondInvitation();
  const seriesList = useSeriesList();
  const tournaments = useTournaments();
  const tournamentTeams = useTournamentTeams();
  const { user, isAdmin } = useAuth();

  const team = teams.data?.find((t) => t.id === teamId);

  if (teams.isLoading || players.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!team)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Team not found.{" "}
          <Link to="/teams" className="underline">
            Back to teams
          </Link>
        </CardContent>
      </Card>
    );

  const canManage = Boolean(user && (team.created_by === user.id || isAdmin));
  const roster = (members.data ?? []).filter((m) => m.team_id === teamId);
  const rosterPlayers = roster
    .map((m) => ({ member: m, player: players.data?.find((p) => p.id === m.player_id) }))
    .filter((r) => r.player) as { member: (typeof roster)[number]; player: Player }[];
  const s = stats.data?.find((x) => x.team_id === teamId);
  const teamMatches = (matches.data ?? []).filter(
    (m) => m.team_a_id === teamId || m.team_b_id === teamId,
  );
  const teamName = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? "TBD";
  const profileOf = (p: Player): Profile | undefined =>
    profiles.data?.find((pr) => pr.id === p.user_id);
  const pending = (invitations.data ?? []).filter((i) => i.status === "pending");

  const pool = (players.data ?? []).filter(
    (p) =>
      !roster.some((m) => m.player_id === p.id) &&
      !pending.some((i) => i.player_id === p.id) &&
      (p.user_id ? profileOf(p)?.is_available !== false : true),
  );

  const seriesForTeam = (seriesList.data ?? []).filter(
    (x) => x.team_a_id === teamId || x.team_b_id === teamId,
  );
  const tournamentsForTeam = (tournaments.data ?? []).filter((t) =>
    (tournamentTeams.data ?? []).some((tt) => tt.tournament_id === t.id && tt.team_id === teamId),
  );
  const trophies = tournamentsForTeam.filter((t) => {
    const final = teamMatches.find((m) => m.tournament_id === t.id && m.stage === "Final");
    return final?.state === "VERIFIED" || final?.state === "ARCHIVED";
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        {team.logo_url ? (
          <img src={team.logo_url} alt={`${team.name} logo`} className="size-16 rounded-2xl object-cover" />
        ) : (
          <span
            className="grid size-16 place-items-center rounded-2xl text-lg font-bold"
            style={{
              backgroundColor: `${team.primary_color ?? "#0f7a4d"}22`,
              color: team.primary_color ?? undefined,
            }}
          >
            {(team.short_name || team.name).slice(0, 3).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[team.city, team.country].filter(Boolean).join(", ") || "Location TBD"} ·{" "}
            {team.home_ground || "No home ground"}
            {team.founded_year ? ` · est. ${team.founded_year}` : ""}
          </p>
        </div>
        {team.is_active === false && <Badge variant="outline">Inactive</Badge>}
      </header>

      <Tabs defaultValue="Overview">
        <TabsList className="flex w-full flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Overview" className="space-y-4 pt-4">
          <Card className="shadow-card">
            <CardContent className="space-y-3 p-5">
              <p className="text-sm">{team.description || "No description yet."}</p>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Fact label="Captain" value={playerLabel(players.data, team.captain_player_id)} />
                <Fact
                  label="Vice-captain"
                  value={playerLabel(players.data, team.vice_captain_player_id)}
                />
                <Fact label="Squad size" value={String(roster.length)} />
                <Fact
                  label="Colours"
                  value={`${team.primary_color ?? "—"} / ${team.secondary_color ?? "—"}`}
                />
              </div>
            </CardContent>
          </Card>
          <StatsCard s={s} />
        </TabsContent>

        <TabsContent value="Squad" className="pt-4">
          <Card className="shadow-card">
            <CardContent className="divide-y p-0">
              {rosterPlayers.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">
                  No accepted players yet. Invite from the Players tab.
                </p>
              )}
              {rosterPlayers.map(({ member, player }) => {
                const pr = profileOf(player);
                return (
                  <div key={player.id} className="flex items-center gap-4 p-4">
                    <Avatar url={player.photo_url ?? pr?.avatar_url ?? null} name={player.full_name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {player.full_name}
                        {member.jersey_number ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            #{member.jersey_number}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[player.role ?? pr?.primary_role, player.batting_style ?? pr?.batting_style, player.bowling_style ?? pr?.bowling_style]
                          .filter(Boolean)
                          .join(" · ") || "Style not set"}
                      </p>
                    </div>
                    <Badge className="ml-auto" variant={pr?.is_available ? "default" : "outline"}>
                      {pr?.status ?? (pr?.is_available ? "available" : "registered")}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Matches" className="space-y-3 pt-4">
          {teamMatches.length === 0 && (
            <Card className="border-dashed shadow-none">
              <CardContent className="p-5 text-sm text-muted-foreground">
                No fixtures yet.
              </CardContent>
            </Card>
          )}
          {teamMatches.map((m) => (
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
        </TabsContent>

        <TabsContent value="Players" className="space-y-4 pt-4">
          {canManage && pending.length > 0 && (
            <Card className="shadow-card">
              <CardContent className="space-y-2 p-5">
                <p className="text-sm font-semibold">Awaiting player response</p>
                {pending.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 text-sm">
                    <span>{playerLabel(players.data, i.player_id)}</span>
                    <Badge variant="outline">pending</Badge>
                    <button
                      className="ml-auto text-xs underline"
                      onClick={() =>
                        respond.mutate(
                          { id: i.id, status: "cancelled" },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      cancel invite
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pool.length === 0 && (
              <Card className="border-dashed shadow-none sm:col-span-2 lg:col-span-3">
                <CardContent className="p-5 text-sm text-muted-foreground">
                  Nobody left in the available pool.
                </CardContent>
              </Card>
            )}
            {pool.map((p) => {
              const pr = profileOf(p);
              const bat = careerBatting(deliveries.data ?? [], p.id);
              const bowl = careerBowling(deliveries.data ?? [], p.id);
              return (
                <Card key={p.id} className="shadow-card">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar url={p.photo_url ?? pr?.avatar_url ?? null} name={p.full_name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{p.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.role ?? pr?.primary_role, p.batting_style ?? pr?.batting_style]
                            .filter(Boolean)
                            .join(" · ") || "Role not set"}
                        </p>
                      </div>
                      <Badge className="ml-auto" variant={pr?.is_available ? "default" : "outline"}>
                        {pr?.is_available ? "available" : "registered"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <Mini label="Runs" value={bat.runs} />
                      <Mini label="Avg" value={bat.average ?? "—"} />
                      <Mini label="Wkts" value={bowl.wickets} />
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={invite.isPending}
                        onClick={() =>
                          invite.mutate(
                            { teamId, playerId: p.id },
                            {
                              onSuccess: () =>
                                toast.success("Invitation sent — the player must accept it"),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                      >
                        + Add to team
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="Statistics" className="pt-4">
          <StatsCard s={s} />
        </TabsContent>

        <TabsContent value="Trophies" className="pt-4">
          <Card className="shadow-card">
            <CardContent className="space-y-2 p-5 text-sm">
              {trophies.length === 0 ? (
                <p className="text-muted-foreground">No silverware yet.</p>
              ) : (
                trophies.map((t) => <p key={t.id}>🏆 {t.name}</p>)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Series" className="space-y-3 pt-4">
          {seriesForTeam.length === 0 && (
            <p className="text-sm text-muted-foreground">Not part of any series yet.</p>
          )}
          {seriesForTeam.map((x) => (
            <Link key={x.id} to="/series/$seriesId" params={{ seriesId: x.id }}>
              <Card className="shadow-card transition-shadow hover:shadow-lift">
                <CardContent className="flex items-center gap-3 p-4 text-sm">
                  <span className="font-medium">{x.name}</span>
                  <Badge variant="outline" className="ml-auto">
                    {x.approval_status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </TabsContent>

        <TabsContent value="Tournaments" className="space-y-3 pt-4">
          {tournamentsForTeam.length === 0 && (
            <p className="text-sm text-muted-foreground">Not entered in any tournament yet.</p>
          )}
          {tournamentsForTeam.map((t) => (
            <Link key={t.id} to="/tournaments/$tournamentId" params={{ tournamentId: t.id }}>
              <Card className="shadow-card transition-shadow hover:shadow-lift">
                <CardContent className="flex items-center gap-3 p-4 text-sm">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="outline" className="ml-auto">
                    {t.format}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function playerLabel(players: Player[] | undefined, id: string | null | undefined) {
  if (!id) return "—";
  return players?.find((p) => p.id === id)?.full_name ?? "—";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <p className="font-bold">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt={name} className="size-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function StatsCard({ s }: { s: ReturnType<typeof useTeamStats>["data"] extends (infer T)[] | undefined ? T | undefined : never }) {
  const cells: [string, string | number][] = [
    ["Matches", s?.played ?? 0],
    ["Wins", s?.won ?? 0],
    ["Losses", s?.lost ?? 0],
    ["Win %", s?.win_pct ?? 0],
    ["Runs", s?.runs_for ?? 0],
    ["Highest", s?.highest_score ?? 0],
    ["Lowest", s?.lowest_score ?? 0],
    ["No result", s?.no_result ?? 0],
  ];
  return (
    <Card className="shadow-card">
      <CardContent className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-lg font-bold">{value}</p>
            <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
