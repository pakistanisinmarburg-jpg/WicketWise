import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-context";
import { useCreateTournament, useTournaments } from "@/features/competitions";
import type { TournamentFormat } from "@/lib/types";

export const Route = createFileRoute("/tournaments/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tournaments — WicketWise" },
      { name: "description", content: "League, knockout and group tournaments with points tables." },
      { property: "og:title", content: "Tournaments — WicketWise" },
      { property: "og:description", content: "Points, NRR and brackets computed from every ball." },
    ],
  }),
  component: TournamentsPage,
});

const FORMATS: [TournamentFormat, string][] = [
  ["league", "League"],
  ["knockout", "Knockout"],
  ["group_knockout", "Group + Knockout"],
];

function TournamentsPage() {
  const list = useTournaments();
  const { isCaptain, isAdmin, user } = useAuth();

  const visible = (list.data ?? []).filter(
    (t) => t.approval_status === "approved" || isAdmin || t.created_by === user?.id,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tournaments</h1>
          <p className="text-sm text-muted-foreground">
            Tournaments stay private until an admin approves them.
          </p>
        </div>
        {isCaptain && <NewTournamentDialog />}
      </header>

      {list.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : visible.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No tournaments yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <Link key={t.id} to="/tournaments/$tournamentId" params={{ tournamentId: t.id }}>
              <Card className="h-full shadow-card transition-shadow hover:shadow-lift">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start gap-2">
                    <p className="font-semibold">{t.name}</p>
                    <Badge variant="outline" className="ml-auto capitalize">
                      {t.approval_status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {FORMATS.find((f) => f[0] === t.format)?.[1]} · {t.team_count} teams
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.venue || "Venue TBD"} ·{" "}
                    {t.start_date ? new Date(t.start_date).toLocaleDateString() : "Dates TBD"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTournamentDialog() {
  const create = useCreateTournament();
  const [open, setOpen] = useState(false);
  const empty = {
    name: "",
    organizer: "",
    venue: "",
    start_date: "",
    end_date: "",
    team_count: "8",
    points_per_win: "2",
    points_per_tie: "1",
    points_per_loss: "0",
    description: "",
    rules: "",
  };
  const [form, setForm] = useState(empty);
  const [format, setFormat] = useState<TournamentFormat>("league");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create tournament</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a tournament</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                name: form.name,
                organizer: form.organizer || null,
                venue: form.venue || null,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                format,
                team_count: Number(form.team_count) || 0,
                points_per_win: Number(form.points_per_win),
                points_per_tie: Number(form.points_per_tie),
                points_per_loss: Number(form.points_per_loss),
                description: form.description || null,
                rules: form.rules || null,
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setForm(empty);
                  toast.success("Tournament drafted — submit it for admin approval");
                },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label>Tournament name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as TournamentFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["organizer", "Organizer", "text"],
                ["venue", "Venue", "text"],
                ["start_date", "Start date", "date"],
                ["end_date", "End date", "date"],
                ["team_count", "Number of teams", "number"],
                ["points_per_win", "Points per win", "number"],
                ["points_per_tie", "Points per tie", "number"],
                ["points_per_loss", "Points per loss", "number"],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Rules</Label>
            <Textarea
              value={form.rules}
              onChange={(e) => setForm({ ...form, rules: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            Save tournament
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
