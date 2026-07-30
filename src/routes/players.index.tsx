import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { StatCounter } from "@/components/stat-counter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllDeliveries, useCreatePlayer, usePlayers } from "@/features/api";
import { useProfiles } from "@/features/people";
import { useAuth } from "@/features/auth/auth-context";
import { careerBatting } from "@/lib/cricket";

export const Route = createFileRoute("/players/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Players — WicketWise" },
      {
        name: "description",
        content: "Every registered player, with batting and bowling careers derived from scoring data.",
      },
      { property: "og:title", content: "Players — WicketWise" },
      { property: "og:description", content: "Browse the club's player register and career records." },
    ],
  }),
  component: PlayersPage,
});

function PlayersPage() {
  const players = usePlayers();
  const deliveries = useAllDeliveries();
  const { user, isCaptain } = useAuth();
  const profiles = useProfiles();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Players</h1>
          <p className="text-sm text-muted-foreground">
            Registration only — runs and wickets are never typed in here.
          </p>
        </div>
        {user && <NewPlayerDialog />}
      </header>

      {isCaptain && (
        <Card className="shadow-card">
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="text-sm font-semibold">Available for selection</p>
              <p className="text-xs text-muted-foreground">
                Members who have switched their availability on.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(profiles.data ?? []).filter((p) => p.is_available && p.status !== "suspended").length ===
              0 ? (
                <p className="text-xs text-muted-foreground">Nobody is available right now.</p>
              ) : (
                (profiles.data ?? [])
                  .filter((p) => p.is_available && p.status !== "suspended")
                  .map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium"
                    >
                      {p.full_name || "Unnamed player"}
                      {p.primary_role ? (
                        <span className="ml-1 text-muted-foreground">· {p.primary_role}</span>
                      ) : null}
                    </span>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {players.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (players.data?.length ?? 0) === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No players registered yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.data!.map((p) => {
            const bat = careerBatting(deliveries.data ?? [], p.id);
            return (
              <Link key={p.id} to="/players/$playerId" params={{ playerId: p.id }}>
                <Card className="h-full shadow-card transition-shadow hover:shadow-lift">
                  <CardContent className="flex items-center gap-4 p-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                      {p.full_name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.role, p.batting_style, p.bowling_style].filter(Boolean).join(" · ") ||
                          "No style recorded"}
                      </p>
                      <p className="tabular mt-1 text-xs text-muted-foreground">
                        <StatCounter value={bat.runs} /> runs · SR{" "}
                        <StatCounter value={bat.strikeRate} decimals={1} />
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewPlayerDialog() {
  const create = useCreatePlayer();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    role: "",
    batting_style: "",
    bowling_style: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Register player</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a player</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form, {
              onSuccess: () => {
                setOpen(false);
                setForm({ full_name: "", role: "", batting_style: "", bowling_style: "" });
                toast.success("Player registered");
              },
              onError: (err) => toast.error(err.message),
            });
          }}
        >
          {(
            [
              ["full_name", "Full name", true],
              ["role", "Role (batter / bowler / all-rounder)", false],
              ["batting_style", "Batting style", false],
              ["bowling_style", "Bowling style", false],
            ] as const
          ).map(([key, label, required]) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Input
                value={form[key]}
                required={required}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={create.isPending}>
            Save player
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
