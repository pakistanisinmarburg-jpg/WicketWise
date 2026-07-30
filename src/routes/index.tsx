import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CircleDot,
  Radio,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";

import { LiveDot, StatCounter } from "@/components/stat-counter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllDeliveries, useMatches, usePlayers, useTeams } from "@/features/api";
import { summariseInnings } from "@/lib/cricket";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WicketWise — Cricket community, matches & live scoring" },
      {
        name: "description",
        content:
          "WicketWise runs your cricket club: players, teams, fixtures, ball-by-ball live scoring and statistics that calculate themselves.",
      },
      { property: "og:title", content: "WicketWise — Cricket community & live scoring" },
      {
        property: "og:description",
        content:
          "Register players, build teams, score ball-by-ball and get every statistic derived automatically.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const players = usePlayers();
  const teams = useTeams();
  const matches = useMatches();
  const deliveries = useAllDeliveries();

  const live = matches.data?.filter((m) => m.status === "live") ?? [];
  const upcoming = matches.data?.filter((m) => m.status === "scheduled").slice(0, 4) ?? [];
  const totals = summariseInnings(deliveries.data ?? []);

  const loading = players.isLoading || teams.isLoading || matches.isLoading;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-sidebar p-8 text-sidebar-foreground shadow-lift md:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-xl"
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Cricket, kept honest
          </p>
          <h1 className="mt-3 text-4xl font-bold md:text-5xl">
            Every number here was earned ball by ball.
          </h1>
          <p className="mt-4 text-sm text-sidebar-foreground/75 md:text-base">
            Nobody types in an average. Score the match delivery by delivery and WicketWise derives
            every career stat, economy rate and standing from that one record.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              className="rounded-full bg-live px-6 text-live-foreground shadow-lift hover:bg-live/90"
            >
              <Link to="/matches">
                Go to matches <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-sidebar-foreground/30 bg-transparent px-6 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <Link to="/players">Register a player</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      <section className="grid grid-cols-3 gap-4 sm:grid-cols-5">
        <QuickLink to="/live" icon={Radio} label="Live scoring" />
        <QuickLink to="/teams" icon={Users} label="Teams" />
        <QuickLink to="/tournaments" icon={Trophy} label="Tournaments" />
        <QuickLink to="/rankings" icon={BarChart3} label="Rankings" />
        <QuickLink to="/players" icon={UserPlus} label="Players" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Players"
          value={players.data?.length ?? 0}
          icon={Users}
          loading={loading}
        />
        <StatTile label="Teams" value={teams.data?.length ?? 0} icon={Trophy} loading={loading} />
        <StatTile
          label="Matches"
          value={matches.data?.length ?? 0}
          icon={CircleDot}
          loading={loading}
        />
        <StatTile
          label="Balls bowled"
          value={totals.legalBalls}
          icon={CircleDot}
          loading={deliveries.isLoading}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Live now</h2>
          {live.length > 0 && <LiveDot />}
        </div>
        {matches.isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : live.length === 0 ? (
          <EmptyCard text="No match is being scored right now." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((m) => (
              <MatchRow key={m.id} id={m.id} title={m.title ?? "Match"} sub={m.venue ?? ""} live />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming</h2>
        {matches.isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : upcoming.length === 0 ? (
          <EmptyCard text="No fixtures scheduled yet." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((m) => (
              <MatchRow
                key={m.id}
                id={m.id}
                title={m.title ?? "Match"}
                sub={new Date(m.match_date).toLocaleString()}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-2 rounded-2xl p-3 text-center transition-colors hover:bg-primary/5"
    >
      <span className="grid size-14 place-items-center rounded-full border-2 border-primary/25 text-primary transition-colors group-hover:border-primary group-hover:bg-primary/10">
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </Link>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  loading: boolean;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-14" />
          ) : (
            <p className="tabular text-2xl font-bold">
              <StatCounter value={value} />
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MatchRow({
  id,
  title,
  sub,
  live,
}: {
  id: string;
  title: string;
  sub: string;
  live?: boolean;
}) {
  return (
    <Link to="/matches/$matchId" params={{ matchId: id }}>
      <Card className="shadow-card transition-shadow hover:shadow-lift">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{sub}</p>
          </div>
          {live ? <LiveDot /> : <ArrowRight className="size-4 text-muted-foreground" />}
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="p-6 text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
