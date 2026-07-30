import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Medal,
  Plus,
  Radio,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAllDeliveries,
  useAllInnings,
  useMatches,
  usePlayers,
  useTeamMembers,
  useTeams,
} from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import {
  useMyInvitations,
  useTeamInvitations,
  useTeamStats,
} from "@/features/competitions";
import { useMyScoringAssignments } from "@/features/scoring-assignments";
import { careerBatting, careerBowling } from "@/lib/cricket";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your dashboard — WicketWise" },
      {
        name: "description",
        content: "Your teams, matches, pending responses and quick actions in one place.",
      },
      { property: "og:title", content: "Your dashboard — WicketWise" },
      { property: "og:description", content: "Everything you need before the next game." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, isCaptain, isAdmin, profile } = useAuth();
  const players = usePlayers();
  const teams = useTeams();
  const members = useTeamMembers();
  const matches = useMatches();
  const deliveries = useAllDeliveries();
  const innings = useAllInnings();
  const teamStats = useTeamStats();
  const assignments = useMyScoringAssignments(user?.id);

  const myPlayerIds = (players.data ?? []).filter((p) => p.user_id === user?.id).map((p) => p.id);
  const invitations = useMyInvitations(myPlayerIds);
  const sentInvites = useTeamInvitations();

  if (!user)
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="underline">
            Sign in
          </Link>{" "}
          to open your dashboard.
        </CardContent>
      </Card>
    );

  if (players.isLoading || matches.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  const myTeams = (teams.data ?? []).filter(
    (t) =>
      t.created_by === user.id ||
      (members.data ?? []).some(
        (m) => m.team_id === t.id && myPlayerIds.includes(m.player_id),
      ),
  );
  const myTeamIds = new Set(myTeams.map((t) => t.id));
  const myMatches = (matches.data ?? []).filter(
    (m) => myTeamIds.has(m.team_a_id) || myTeamIds.has(m.team_b_id) || m.created_by === user.id,
  );
  const upcoming = myMatches
    .filter((m) => !["COMPLETED", "VERIFIED", "ARCHIVED"].includes(m.state))
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .slice(0, 5);
  const liveNow = myMatches.filter((m) => m.state === "LIVE");

  const inningsIds = new Set(
    (innings.data ?? [])
      .filter((i) => myMatches.some((m) => m.id === i.match_id))
      .map((i) => i.id),
  );
  const balls = deliveries.data ?? [];
  const bat = careerBatting(balls, myPlayerIds[0] ?? "");
  const bowl = careerBowling(balls, myPlayerIds[0] ?? "");
  const teamRows = (teamStats.data ?? []).filter((t) => myTeamIds.has(t.team_id));
  const played = teamRows.reduce((s, t) => s + t.played, 0);
  const won = teamRows.reduce((s, t) => s + t.won, 0);
  const winPct = played === 0 ? 0 : (won / played) * 100;

  const pendingResponses = (sentInvites.data ?? []).filter(
    (i) => i.status === "pending" && myTeamIds.has(i.team_id),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isAdmin ? "Admin" : isCaptain ? "Captain" : "Player"} dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Open admin console</Link>
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="My teams" value={myTeams.length} />
        <Stat label="Squad size" value={
          (members.data ?? []).filter((m) => myTeamIds.has(m.team_id)).length
        } />
        <Stat label="Matches" value={played || myMatches.length} />
        <Stat label="Win %" value={`${winPct.toFixed(0)}%`} />
        <Stat label="Runs" value={bat.runs} />
        <Stat label="Wickets" value={bowl.wickets} />
      </div>

      {isCaptain && (
        <Card className="shadow-card">
          <CardContent className="space-y-3 p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Quick actions
            </p>
            <div className="flex flex-wrap gap-2">
              <Action to="/teams" icon={Trophy} label="Create team" />
              <Action to="/matches" icon={Plus} label="Create match" />
              <Action to="/series" icon={Swords} label="Create series" />
              <Action to="/tournaments" icon={Medal} label="Create tournament" />
              <Action to="/players" icon={UserPlus} label="Select players" />
              <Action to="/scoring" icon={ClipboardCheck} label="Start live scoring" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming matches" empty="Nothing scheduled.">
          {upcoming.map((m) => (
            <Row
              key={m.id}
              to={`/matches/${m.id}`}
              title={m.title || "Match"}
              subtitle={`${new Date(m.match_date).toLocaleDateString()} · ${m.venue ?? "Venue TBC"}`}
              badge={m.state}
            />
          ))}
        </Panel>

        <Panel title="Live now" empty="No match in play.">
          {liveNow.map((m) => (
            <Row
              key={m.id}
              to={`/matches/${m.id}`}
              title={m.title || "Match"}
              subtitle={m.venue ?? "Venue TBC"}
              badge="LIVE"
              live
            />
          ))}
        </Panel>

        <Panel title="Your invitations" empty="No pending invitations.">
          {(invitations.data ?? []).map((i) => (
            <Row
              key={i.id}
              to={`/teams/${i.team_id}`}
              title={teams.data?.find((t) => t.id === i.team_id)?.name ?? "Team"}
              subtitle="Respond from your profile"
              badge="pending"
            />
          ))}
        </Panel>

        {isCaptain ? (
          <Panel title="Pending player responses" empty="Everyone has responded.">
            {pendingResponses.map((i) => (
              <Row
                key={i.id}
                to={`/teams/${i.team_id}`}
                title={players.data?.find((p) => p.id === i.player_id)?.full_name ?? "Player"}
                subtitle={teams.data?.find((t) => t.id === i.team_id)?.name ?? "Team"}
                badge="awaiting"
              />
            ))}
          </Panel>
        ) : (
          <Panel title="Scoring assignments" empty="None right now.">
            {(assignments.data ?? []).map((a) => (
              <Row
                key={a.id}
                to={`/matches/${a.match_id}/score`}
                title={matches.data?.find((m) => m.id === a.match_id)?.title || "Match"}
                subtitle="Opens the scoring console"
                badge="scorer"
              />
            ))}
          </Panel>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {inningsIds.size} innings of yours are indexed for statistics.{" "}
        <Link to="/profile" className="underline">
          Manage availability
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="tabular text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Action({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}>
        <Icon className="size-4" /> {label}
      </Link>
    </Button>
  );
}

function Panel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.flat() : [children];
  const hasItems = items.some(Boolean) && items.length > 0 && items[0] !== undefined;
  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        {hasItems ? children : <p className="border-t px-4 py-6 text-sm text-muted-foreground">{empty}</p>}
      </CardContent>
    </Card>
  );
}

function Row({
  to,
  title,
  subtitle,
  badge,
  live,
}: {
  to: string;
  title: string;
  subtitle: string;
  badge: string;
  live?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 border-t px-4 py-3 hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant={live ? "destructive" : "secondary"} className="shrink-0">
        {badge}
      </Badge>
    </Link>
  );
}
