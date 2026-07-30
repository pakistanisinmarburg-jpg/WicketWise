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
import { useTeams } from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import { useCreateSeries, useSeriesList } from "@/features/competitions";

export const Route = createFileRoute("/series/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Series — WicketWise" },
      { name: "description", content: "Multi-match series with live standings." },
      { property: "og:title", content: "Series — WicketWise" },
      { property: "og:description", content: "Track head-to-head series and standings." },
    ],
  }),
  component: SeriesPage,
});

function SeriesPage() {
  const list = useSeriesList();
  const teams = useTeams();
  const { isCaptain, isAdmin, user } = useAuth();

  const teamName = (id: string | null) =>
    id ? (teams.data?.find((t) => t.id === id)?.name ?? "TBD") : "TBD";

  const visible = (list.data ?? []).filter(
    (s) => s.approval_status === "approved" || isAdmin || s.created_by === user?.id,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Series</h1>
          <p className="text-sm text-muted-foreground">
            Series stay private until an admin approves them.
          </p>
        </div>
        {isCaptain && <NewSeriesDialog />}
      </header>

      {list.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : visible.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">No series yet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <Link key={s.id} to="/series/$seriesId" params={{ seriesId: s.id }}>
              <Card className="h-full shadow-card transition-shadow hover:shadow-lift">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-start gap-2">
                    <p className="font-semibold">{s.name}</p>
                    <Badge variant="outline" className="ml-auto capitalize">
                      {s.approval_status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {teamName(s.team_a_id)} vs {teamName(s.team_b_id)} · best of {s.match_count}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.start_date ? new Date(s.start_date).toLocaleDateString() : "Dates TBD"}
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

function NewSeriesDialog() {
  const create = useCreateSeries();
  const teams = useTeams();
  const [open, setOpen] = useState(false);
  const empty = {
    name: "",
    description: "",
    team_a_id: "",
    team_b_id: "",
    match_count: "3",
    start_date: "",
    end_date: "",
    points_per_win: "2",
    points_per_tie: "1",
  };
  const [form, setForm] = useState(empty);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create series</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a series</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                name: form.name,
                description: form.description || null,
                team_a_id: form.team_a_id || null,
                team_b_id: form.team_b_id || null,
                match_count: Number(form.match_count) || 1,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                points_per_win: Number(form.points_per_win),
                points_per_tie: Number(form.points_per_tie),
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setForm(empty);
                  toast.success("Series created as a draft — submit it for admin approval");
                },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label>Series name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["team_a_id", "Team A"],
                ["team_b_id", "Team B"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Select
                  value={form[key]}
                  onValueChange={(v) => setForm({ ...form, [key]: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {(teams.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {(
              [
                ["match_count", "Number of matches", "number"],
                ["start_date", "Start date", "date"],
                ["end_date", "End date", "date"],
                ["points_per_win", "Points per win", "number"],
                ["points_per_tie", "Points per tie", "number"],
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
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            Save series
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
