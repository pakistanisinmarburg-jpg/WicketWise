import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { LiveDot } from "@/components/stat-counter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateMatch, useMatches, useTeams } from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import { useSeriesList, useTournaments } from "@/features/competitions";

export const Route = createFileRoute("/matches/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Matches — WicketWise" },
      { name: "description", content: "Live, upcoming and completed fixtures with full scorecards." },
      { property: "og:title", content: "Matches — WicketWise" },
      { property: "og:description", content: "Follow live scores and browse past scorecards." },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const matches = useMatches();
  const teams = useTeams();
  const { user, isCaptain } = useAuth();

  const teamName = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? "TBD";

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Matches</h1>
          <p className="text-sm text-muted-foreground">Fixtures, live scoring and scorecards.</p>
        </div>
        {isCaptain && <NewMatchDialog />}
      </header>

      {matches.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (matches.data?.length ?? 0) === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No matches yet. Create one to start scoring.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {matches.data!.map((m) => (
            <Link key={m.id} to="/matches/$matchId" params={{ matchId: m.id }}>
              <Card className="shadow-card transition-shadow hover:shadow-lift">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-semibold">
                      {teamName(m.team_a_id)} vs {teamName(m.team_b_id)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {m.title ? `${m.title} · ` : ""}
                      {m.venue ? `${m.venue} · ` : ""}
                      {new Date(m.match_date).toLocaleDateString()} · {m.overs_per_innings} overs
                    </p>
                    {m.result_text && (
                      <p className="mt-1 text-sm font-medium text-success">{m.result_text}</p>
                    )}
                  </div>
                  {m.status === "live" ? (
                    <LiveDot />
                  ) : (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground capitalize">
                      {m.status}
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const FORMATS = ["T10", "T20", "The Hundred", "ODI 50", "One-day 40", "Multi-day", "Test"];
const BALL_TYPES = ["Leather", "Tennis", "Tape ball", "Synthetic"];
const NONE = "__none";

function NewMatchDialog() {
  const teams = useTeams();
  const create = useCreateMatch();
  const navigate = useNavigate();
  const seriesList = useSeriesList();
  const tournaments = useTournaments();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    venue: "",
    overs_per_innings: 20,
    team_a_id: "",
    team_b_id: "",
    match_type: "Friendly",
    match_date: new Date().toISOString().slice(0, 10),
    start_time: "",
    format: "T20",
    ball_type: "Leather",
    innings_count: 1,
    series_id: NONE,
    tournament_id: NONE,
    stage: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New match</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a match</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.team_a_id === form.team_b_id) {
              toast.error("Pick two different teams");
              return;
            }
            create.mutate(
              {
                ...form,
                overs_per_innings: Number(form.overs_per_innings),
                innings_count: Number(form.innings_count),
                start_time: form.start_time || null,
                stage: form.stage || null,
                series_id: form.series_id === NONE ? null : form.series_id,
                tournament_id: form.tournament_id === NONE ? null : form.tournament_id,
              },
              {
                onSuccess: (m) => {
                  setOpen(false);
                  navigate({ to: "/matches/$matchId", params: { matchId: m.id } });
                },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label>Match name</Label>
            <Input
              value={form.title}
              placeholder="Sunday League — Round 3"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Match type</Label>
              <Input
                value={form.match_type}
                placeholder="Friendly / League"
                onChange={(e) => setForm({ ...form, match_type: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                required
                value={form.match_date}
                onChange={(e) => setForm({ ...form, match_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Start time</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TeamSelect
              label="Team A"
              value={form.team_a_id}
              options={teams.data ?? []}
              onChange={(v) => setForm({ ...form, team_a_id: v })}
            />
            <TeamSelect
              label="Team B"
              value={form.team_b_id}
              options={teams.data ?? []}
              onChange={(v) => setForm({ ...form, team_b_id: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={form.format}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    format: v,
                    innings_count: v === "Test" || v === "Multi-day" ? 2 : 1,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ball type</Label>
              <Select
                value={form.ball_type}
                onValueChange={(v) => setForm({ ...form, ball_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BALL_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Overs per innings</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={form.overs_per_innings}
                onChange={(e) => setForm({ ...form, overs_per_innings: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Innings per team</Label>
              <Select
                value={String(form.innings_count)}
                onValueChange={(v) => setForm({ ...form, innings_count: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 innings</SelectItem>
                  <SelectItem value="2">2 innings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Series</Label>
              <Select
                value={form.series_id}
                onValueChange={(v) => setForm({ ...form, series_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Standalone</SelectItem>
                  {(seriesList.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tournament</Label>
              <Select
                value={form.tournament_id}
                onValueChange={(v) => setForm({ ...form, tournament_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Standalone</SelectItem>
                  {(tournaments.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.tournament_id !== NONE && (
            <div className="space-y-2">
              <Label>Stage (e.g. Group A, Semi-final, Final)</Label>
              <Input
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
              />
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={create.isPending || !form.team_a_id || !form.team_b_id}
          >
            Create match
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select team" />
        </SelectTrigger>
        <SelectContent>
          {options.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
