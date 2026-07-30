import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ShieldAlert, Star, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-context";
import { useReviewCompetition, useSeriesList, useTournaments } from "@/features/competitions";
import { useAuditLogs, useCorrectionRequests, useReviewCorrection } from "@/features/integrity";
import { useMatches } from "@/features/api";
import { useCreateVenue, useDeleteVenue, useVenues } from "@/features/venues";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  useCaptainRequests,
  useProfiles,
  useReviewCaptainRequest,
  useUpdateProfile,
  useUserRoles,
} from "@/features/people";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin console — WicketWise" },
      { name: "description", content: "Approve captain requests and manage club members." },
      { property: "og:title", content: "Admin console — WicketWise" },
      { property: "og:description", content: "Captain approvals, member roles and suspensions." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const requests = useCaptainRequests();
  const profiles = useProfiles();
  const roles = useUserRoles();
  const review = useReviewCaptainRequest();
  const update = useUpdateProfile();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  if (!isAdmin)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <ShieldAlert className="size-5" />
          Admins only. Row-level security enforces this on the database too.
        </CardContent>
      </Card>
    );

  const nameOf = (id: string) =>
    profiles.data?.find((p) => p.id === id)?.full_name || "Unknown player";
  const rolesOf = (id: string) =>
    (roles.data ?? []).filter((r) => r.user_id === id).map((r) => r.role);

  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const reviewed = (requests.data ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Admin console</h1>
        <p className="text-sm text-muted-foreground">
          Captain approvals and member management. Every action is enforced by RLS.
        </p>
      </header>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">
            Captain requests{pending.length ? ` (${pending.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="competitions">Competitions</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="space-y-3">
          <VenuesAdmin />
        </TabsContent>

        <TabsContent value="disputes" className="space-y-3">
          <DisputesQueue />
        </TabsContent>

        <TabsContent value="audit" className="space-y-3">
          <AuditTrail />
        </TabsContent>

        <TabsContent value="competitions" className="space-y-3">
          <CompetitionQueue />
        </TabsContent>

        <TabsContent value="requests" className="space-y-3">
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p>
          )}
          {pending.map((r) => (
            <Card key={r.id} className="shadow-card">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{nameOf(r.user_id)}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.message || "No message provided"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate(
                        { id: r.id, status: "approved", reviewerId: user!.id },
                        {
                          onSuccess: () => toast.success(`${nameOf(r.user_id)} is now a captain`),
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({ id: r.id, status: "rejected", reviewerId: user!.id })
                    }
                  >
                    <X className="size-4" /> Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {reviewed.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Recently reviewed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {reviewed.slice(0, 10).map((r) => (
                  <div key={r.id} className="flex justify-between border-b py-1.5 last:border-0">
                    <span>{nameOf(r.user_id)}</span>
                    <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="members">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {(profiles.data ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {p.full_name || "Unnamed"}
                      {rolesOf(p.id).includes("captain") && (
                        <Star className="size-3.5 fill-gold text-gold" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rolesOf(p.id).join(", ") || "player"} · {p.status}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={p.status === "suspended" ? "outline" : "ghost"}
                    onClick={() =>
                      update.mutate(
                        {
                          id: p.id,
                          patch: {
                            status: p.status === "suspended" ? "registered" : "suspended",
                            is_available: false,
                          },
                        },
                        { onError: (e) => toast.error(e.message) },
                      )
                    }
                  >
                    {p.status === "suspended" ? "Reinstate" : "Suspend"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


/** Series and tournaments waiting on an admin decision. */
function CompetitionQueue() {
  const seriesList = useSeriesList();
  const tournaments = useTournaments();
  const review = useReviewCompetition();

  const rows = [
    ...(seriesList.data ?? []).map((s) => ({ kind: "series" as const, id: s.id, name: s.name, status: s.approval_status })),
    ...(tournaments.data ?? []).map((t) => ({ kind: "tournaments" as const, id: t.id, name: t.name, status: t.approval_status })),
  ].filter((r) => r.status === "submitted");

  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No competitions awaiting approval.</p>;

  return (
    <>
      {rows.map((r) => (
        <Card key={`${r.kind}-${r.id}`} className="shadow-card">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="text-xs uppercase text-muted-foreground">
                {r.kind === "series" ? "Series" : "Tournament"}
              </p>
            </div>
            <Button size="sm" variant="ghost" asChild>
              {r.kind === "series" ? (
                <Link to="/series/$seriesId" params={{ seriesId: r.id }}>
                  View
                </Link>
              ) : (
                <Link to="/tournaments/$tournamentId" params={{ tournamentId: r.id }}>
                  View
                </Link>
              )}
            </Button>
            {(["approved", "changes_requested", "rejected"] as const).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "approved" ? "default" : "outline"}
                disabled={review.isPending}
                onClick={() =>
                  review.mutate(
                    { table: r.kind, id: r.id, status },
                    {
                      onSuccess: () => toast.success(`${r.name} ${status.replace("_", " ")}`),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                {status.replace("_", " ")}
              </Button>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

/** Correction requests filed against completed matches, newest first. */
function DisputesQueue() {
  const requests = useCorrectionRequests();
  const review = useReviewCorrection();
  const matches = useMatches();
  const profiles = useProfiles();

  if (requests.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const rows = requests.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const settled = rows.filter((r) => r.status !== "pending").slice(0, 20);
  const matchTitle = (id: string) =>
    matches.data?.find((m) => m.id === id)?.title || "Match";
  const who = (id: string | null) =>
    profiles.data?.find((p) => p.id === id)?.full_name || "Someone";

  return (
    <>
      {pending.length === 0 && (
        <p className="text-sm text-muted-foreground">No open disputes.</p>
      )}
      {pending.map((r) => (
        <Card key={r.id} className="shadow-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{matchTitle(r.match_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {who(r.requested_by)} · {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <Badge variant="secondary">{r.field ?? "match data"}</Badge>
            </div>
            <p className="rounded-lg bg-muted/60 p-3 text-sm">
              <span className="line-through opacity-60">{r.current_value ?? "—"}</span>{" "}
              <span className="mx-1">→</span>
              <span className="font-semibold">{r.requested_value ?? "—"}</span>
            </p>
            <p className="text-sm text-muted-foreground">Reason: {r.reason}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  review.mutate(
                    { request: r, status: "approved" },
                    { onSuccess: () => toast.success("Correction applied and logged") },
                  )
                }
              >
                <Check className="size-4" /> Approve & apply
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  review.mutate(
                    { request: r, status: "rejected" },
                    { onSuccess: () => toast("Correction rejected") },
                  )
                }
              >
                <X className="size-4" /> Reject
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/matches/$matchId" params={{ matchId: r.match_id }}>
                  Open match
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {settled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recently settled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-0 pb-2">
            {settled.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 border-t px-5 py-2 text-sm"
              >
                <span className="truncate">
                  {matchTitle(r.match_id)} · {r.field ?? "match data"}
                </span>
                <Badge variant={r.status === "approved" ? "default" : "outline"}>{r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Immutable who/what/when/why trail across every audited entity. */
function AuditTrail() {
  const logs = useAuditLogs();
  const profiles = useProfiles();
  if (logs.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const rows = logs.data ?? [];
  const who = (id: string | null) =>
    profiles.data?.find((p) => p.id === id)?.full_name || "System";

  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No audited changes recorded yet.</p>;

  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        {rows.map((l) => (
          <div key={l.id} className="space-y-1 border-b px-5 py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                <Badge variant="outline" className="mr-2 font-mono text-[10px]">
                  {l.action}
                </Badge>
                {who(l.actor_id)}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {new Date(l.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {l.entity_table}
              {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ""}
              {l.reason ? ` · ${l.reason}` : ""}
            </p>
            {(l.before_value || l.after_value) && (
              <pre className="overflow-x-auto rounded-md bg-muted/60 p-2 text-[11px]">
                {JSON.stringify({ before: l.before_value, after: l.after_value }, null, 0)}
              </pre>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Reference data for grounds — admins and captains keep this list clean. */
function VenuesAdmin() {
  const venues = useVenues();
  const create = useCreateVenue();
  const remove = useDeleteVenue();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  return (
    <>
      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-end gap-2 p-5">
          <Input
            className="w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ground name"
          />
          <Input
            className="w-36"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
          />
          <Input
            className="w-36"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Country"
          />
          <Button
            size="sm"
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), city: city.trim() || null, country: country.trim() || null },
                {
                  onSuccess: () => {
                    toast.success("Venue added");
                    setName("");
                    setCity("");
                    setCountry("");
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Add venue
          </Button>
        </CardContent>
      </Card>

      {venues.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (venues.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No venues yet.</p>
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            {(venues.data ?? []).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 border-b px-5 py-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[v.city, v.country].filter(Boolean).join(", ") || "Location not set"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    remove.mutate(v.id, { onError: (e) => toast.error(e.message) })
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
