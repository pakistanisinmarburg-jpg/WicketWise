import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-context";
import { useMyCaptainRequest, useRequestCaptain, useUpdateProfile } from "@/features/people";
import { usePlayers, useTeams } from "@/features/api";
import { useMyInvitations, useRespondInvitation } from "@/features/competitions";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My profile — WicketWise" },
      {
        name: "description",
        content: "Your cricket profile, availability for selection and captain access.",
      },
      { property: "og:title", content: "My profile — WicketWise" },
      { property: "og:description", content: "Manage availability and request captain access." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, roles, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const update = useUpdateProfile();
  const request = useMyCaptainRequest(user?.id);
  const requestCaptain = useRequestCaptain();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (!profile) return <Skeleton className="h-96 rounded-2xl" />;

  const isCaptainRole = roles.includes("captain");
  const pending = request.data?.status === "pending";

  function toggleAvailability(next: boolean) {
    update.mutate(
      {
        id: profile!.id,
        patch: {
          is_available: next,
          status:
            profile!.status === "suspended"
              ? "suspended"
              : next
                ? "available"
                : "unavailable",
        },
      },
      { onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="size-20 rounded-full object-cover"
            />
          ) : (
            <div className="grid size-20 place-items-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {(profile.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{profile.full_name || "Unnamed player"}</h1>
              {isCaptainRole && (
                <Badge className="gap-1 bg-gold/15 text-gold hover:bg-gold/15">
                  <Star className="size-3 fill-current" /> Captain
                </Badge>
              )}
              {isAdmin && <Badge variant="secondary">Admin</Badge>}
              <Badge variant="outline" className="capitalize">
                {profile.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {[profile.primary_role, profile.city, profile.nationality]
                .filter(Boolean)
                .join(" · ") || "Profile incomplete"}
            </p>
            {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
          </div>
          <Button asChild variant="outline">
            <Link to="/onboarding">Edit profile</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Available for selection</p>
            <p className="text-sm text-muted-foreground">
              Captains browse the available pool when picking squads.
            </p>
          </div>
          <Switch
            checked={profile.is_available}
            disabled={profile.status === "suspended" || update.isPending}
            onCheckedChange={toggleAvailability}
          />
        </CardContent>
      </Card>

      <InvitationsInbox />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Cricket profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Batting" value={profile.batting_style} />
            <Row label="Bowling" value={profile.bowling_style} />
            <Row label="Primary role" value={profile.primary_role} />
            <Row label="Secondary role" value={profile.secondary_role} />
            <Row label="Position" value={profile.preferred_position} />
            <Row label="Jersey" value={profile.jersey_number?.toString()} />
            <Row label="Experience" value={profile.experience} />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Captain access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isCaptainRole ? (
              <p className="text-muted-foreground">
                Captain access approved. You can create teams, fixtures and grant match scoring
                permission — you remain a player too.
              </p>
            ) : pending ? (
              <p className="text-muted-foreground">
                Your request is in the admin approval queue. We'll unlock the captain tools as soon
                as it's approved.
              </p>
            ) : (
              <>
                {request.data?.status === "rejected" && (
                  <p className="text-muted-foreground">
                    Your last request was declined. You're welcome to ask again.
                  </p>
                )}
                <Textarea
                  rows={3}
                  maxLength={300}
                  value={message}
                  placeholder="Why should you captain? (optional)"
                  onChange={(e) => setMessage(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={requestCaptain.isPending}
                  onClick={() =>
                    requestCaptain.mutate(
                      { userId: profile.id, message },
                      {
                        onSuccess: () => toast.success("Request sent to admins"),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  <Star className="size-4" /> Request captain access
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}


function InvitationsInbox() {
  const { user } = useAuth();
  const players = usePlayers();
  const teams = useTeams();
  const myPlayerIds = (players.data ?? []).filter((p) => p.user_id === user?.id).map((p) => p.id);
  const invites = useMyInvitations(myPlayerIds);
  const respond = useRespondInvitation();

  if ((invites.data?.length ?? 0) === 0) return null;

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Squad invitations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {invites.data!.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center gap-3">
            <p>
              <span className="font-medium">
                {teams.data?.find((t) => t.id === inv.team_id)?.name ?? "A team"}
              </span>{" "}
              invited you to join their squad.
            </p>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate(
                    { id: inv.id, status: "accepted" },
                    {
                      onSuccess: () => toast.success("You are in the squad"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate(
                    { id: inv.id, status: "declined" },
                    {
                      onSuccess: () => toast.success("Invitation declined"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
