import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateTeam, useTeamMembers, useTeams } from "@/features/api";
import { useAuth } from "@/features/auth/auth-context";
import { useTeamStats } from "@/features/competitions";

export const Route = createFileRoute("/teams/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Teams directory — WicketWise" },
      { name: "description", content: "Search club teams by city, country and form." },
      { property: "og:title", content: "Teams directory — WicketWise" },
      { property: "og:description", content: "Browse teams, captains and win rates." },
    ],
  }),
  component: TeamsPage,
});

const ANY = "__any";

function TeamsPage() {
  const teams = useTeams();
  const members = useTeamMembers();
  const stats = useTeamStats();
  const { isCaptain } = useAuth();

  const [search, setSearch] = useState("");
  const [city, setCity] = useState(ANY);
  const [country, setCountry] = useState(ANY);
  const [active, setActive] = useState("active");
  const [sort, setSort] = useState("ranking");

  const cities = useMemo(
    () => [...new Set((teams.data ?? []).map((t) => t.city).filter(Boolean) as string[])].sort(),
    [teams.data],
  );
  const countries = useMemo(
    () => [...new Set((teams.data ?? []).map((t) => t.country).filter(Boolean) as string[])].sort(),
    [teams.data],
  );
  const statOf = (id: string) => stats.data?.find((s) => s.team_id === id);

  const visible = useMemo(() => {
    const list = (teams.data ?? []).filter((t) => {
      if (search && !`${t.name} ${t.short_name}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (city !== ANY && t.city !== city) return false;
      if (country !== ANY && t.country !== country) return false;
      if (active === "active" && t.is_active === false) return false;
      if (active === "inactive" && t.is_active !== false) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const sa = statOf(a.id);
      const sb = statOf(b.id);
      if (sort === "played") return (sb?.played ?? 0) - (sa?.played ?? 0);
      return (sb?.win_pct ?? 0) - (sa?.win_pct ?? 0) || (sb?.won ?? 0) - (sa?.won ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams.data, stats.data, search, city, country, active, sort]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Every record below is computed from ball-by-ball data.
          </p>
        </div>
        {isCaptain && <NewTeamDialog />}
      </header>

      <Card className="shadow-card">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Search teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FilterSelect value={city} onChange={setCity} label="All cities" options={cities} />
          <FilterSelect
            value={country}
            onChange={setCountry}
            label="All countries"
            options={countries}
          />
          <Select value={active} onValueChange={setActive}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Active &amp; inactive</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ranking">Ranking (win %)</SelectItem>
              <SelectItem value="played">Most played</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {teams.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No teams match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => {
            const s = statOf(t.id);
            return (
              <Link key={t.id} to="/teams/$teamId" params={{ teamId: t.id }}>
                <Card className="h-full shadow-card transition-shadow hover:shadow-lift">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-4">
                      {t.logo_url ? (
                        <img
                          src={t.logo_url}
                          alt={`${t.name} logo`}
                          className="size-12 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span
                          className="grid size-12 shrink-0 place-items-center rounded-xl font-bold"
                          style={{
                            backgroundColor: `${t.primary_color ?? "#0f7a4d"}22`,
                            color: t.primary_color ?? undefined,
                          }}
                        >
                          {(t.short_name || t.name).slice(0, 3).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{t.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[t.city, t.country].filter(Boolean).join(", ") ||
                            t.home_ground ||
                            "Location TBD"}{" "}
                          · {members.data?.filter((m) => m.team_id === t.id).length ?? 0} in squad
                        </p>
                      </div>
                      {t.is_active === false && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        ["P", s?.played ?? 0],
                        ["W", s?.won ?? 0],
                        ["L", s?.lost ?? 0],
                        ["Win %", s?.win_pct ?? 0],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-muted/50 py-2">
                          <p className="text-sm font-bold">{value}</p>
                          <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                        </div>
                      ))}
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

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NewTeamDialog() {
  const create = useCreateTeam();
  const [open, setOpen] = useState(false);
  const empty = {
    name: "",
    short_name: "",
    home_ground: "",
    city: "",
    country: "",
    description: "",
    founded_year: "",
    primary_color: "#0f7a4d",
    secondary_color: "#d9a441",
  };
  const [form, setForm] = useState(empty);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create team</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a team</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                ...form,
                founded_year: form.founded_year ? Number(form.founded_year) : null,
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setForm(empty);
                  toast.success("Team created — now invite players to the squad");
                },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["name", "Team name", true, "text"],
                ["short_name", "Short name (e.g. MRB)", false, "text"],
                ["city", "City", false, "text"],
                ["country", "Country", false, "text"],
                ["home_ground", "Home ground", false, "text"],
                ["founded_year", "Founded year", false, "number"],
                ["primary_color", "Primary colour", false, "color"],
                ["secondary_color", "Secondary colour", false, "color"],
              ] as const
            ).map(([key, label, required, type]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  type={type}
                  value={form[key]}
                  required={required}
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
          <p className="text-xs text-muted-foreground">
            Captain and vice-captain are set from the squad tab once players accept their
            invitations.
          </p>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            Save team
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
