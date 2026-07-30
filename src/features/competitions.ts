import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type {
  ApprovalStatus,
  MatchResult,
  MatchState,
  PointsRow,
  Series,
  SeriesStanding,
  TeamInvitation,
  TeamStats,
  Tournament,
  TournamentTeam,
  UUID,
} from "@/lib/types";

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
};

const currentUser = async () => (await supabase.auth.getUser()).data.user?.id ?? null;

/* -------------------------------------------------------- squad invitations */
export const useTeamInvitations = (teamId?: UUID) =>
  useQuery({
    queryKey: ["team_invitations", teamId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("team_invitations").select("*").order("created_at", { ascending: false });
      if (teamId) q = q.eq("team_id", teamId);
      return unwrap<TeamInvitation[]>(await q);
    },
  });

/** Invitations addressed to the signed-in user's own player records. */
export const useMyInvitations = (playerIds: UUID[]) =>
  useQuery({
    queryKey: ["my_invitations", playerIds.join(",")],
    enabled: playerIds.length > 0,
    queryFn: async () =>
      unwrap<TeamInvitation[]>(
        await supabase
          .from("team_invitations")
          .select("*")
          .in("player_id", playerIds)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ),
  });

export function useInvitePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, playerId }: { teamId: UUID; playerId: UUID }) => {
      const { error } = await supabase
        .from("team_invitations")
        .insert({ team_id: teamId, player_id: playerId, invited_by: await currentUser() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team_invitations"] });
      qc.invalidateQueries({ queryKey: ["my_invitations"] });
    },
  });
}

/** Accept / decline / cancel. Only "accepted" adds the player to the roster. */
export function useRespondInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: UUID; status: TeamInvitation["status"] }) => {
      const { error } = await supabase.from("team_invitations").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team_invitations"] });
      qc.invalidateQueries({ queryKey: ["my_invitations"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
    },
  });
}

/* ------------------------------------------------------------ derived stats */
export const useTeamStats = () =>
  useQuery({
    queryKey: ["team_stats"],
    queryFn: async () => unwrap<TeamStats[]>(await supabase.from("team_stats").select("*")),
  });

export const useMatchResults = () =>
  useQuery({
    queryKey: ["match_results"],
    queryFn: async () => unwrap<MatchResult[]>(await supabase.from("match_results").select("*")),
  });

export const useSeriesStandings = (seriesId?: UUID) =>
  useQuery({
    queryKey: ["series_standings", seriesId],
    enabled: Boolean(seriesId),
    queryFn: async () =>
      unwrap<SeriesStanding[]>(
        await supabase.from("series_standings").select("*").eq("series_id", seriesId!),
      ),
  });

export const useTournamentPoints = (tournamentId?: UUID) =>
  useQuery({
    queryKey: ["tournament_points", tournamentId],
    enabled: Boolean(tournamentId),
    queryFn: async () =>
      unwrap<PointsRow[]>(
        await supabase.from("tournament_points").select("*").eq("tournament_id", tournamentId!),
      ),
  });

/* ----------------------------------------------------------------- series */
export const useSeriesList = () =>
  useQuery({
    queryKey: ["series"],
    queryFn: async () =>
      unwrap<Series[]>(
        await supabase.from("series").select("*").order("created_at", { ascending: false }),
      ),
  });

export const useSeries = (id?: UUID) =>
  useQuery({
    queryKey: ["series", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("series").select("*").eq("id", id!).maybeSingle();
      if (error) throw new Error(error.message);
      return data as Series | null;
    },
  });

export function useCreateSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Series>) => {
      const { data, error } = await supabase
        .from("series")
        .insert({ ...input, created_by: await currentUser() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data as { id: UUID };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["series"] }),
  });
}

export function useUpdateSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: UUID; patch: Partial<Series> }) => {
      const { error } = await supabase.from("series").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["series"] }),
  });
}

/* ------------------------------------------------------------- tournaments */
export const useTournaments = () =>
  useQuery({
    queryKey: ["tournaments"],
    queryFn: async () =>
      unwrap<Tournament[]>(
        await supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
      ),
  });

export const useTournament = (id?: UUID) =>
  useQuery({
    queryKey: ["tournament", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as Tournament | null;
    },
  });

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Tournament>) => {
      const { data, error } = await supabase
        .from("tournaments")
        .insert({ ...input, created_by: await currentUser() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data as { id: UUID };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments"] }),
  });
}

export function useUpdateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: UUID; patch: Partial<Tournament> }) => {
      const { error } = await supabase.from("tournaments").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["tournament"] });
    },
  });
}

export const useTournamentTeams = (tournamentId?: UUID) =>
  useQuery({
    queryKey: ["tournament_teams", tournamentId],
    enabled: Boolean(tournamentId),
    queryFn: async () =>
      unwrap<TournamentTeam[]>(
        await supabase.from("tournament_teams").select("*").eq("tournament_id", tournamentId!),
      ),
  });

export function useAddTournamentTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { tournament_id: UUID; team_id: UUID; group_name?: string | null }) => {
      const { error } = await supabase.from("tournament_teams").upsert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament_teams"] });
      qc.invalidateQueries({ queryKey: ["tournament_points"] });
    },
  });
}

/* --------------------------------------------------------- lifecycle moves */
export function useAdvanceMatchState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, state }: { id: UUID; state: MatchState }) => {
      const { error } = await supabase.from("matches").update({ state }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["match"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["match_results"] });
      qc.invalidateQueries({ queryKey: ["can_score"] });
    },
  });
}

/** Admin review queue for competitions awaiting approval. */
export function useReviewCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      table,
      id,
      status,
      note,
    }: {
      table: "series" | "tournaments";
      id: UUID;
      status: ApprovalStatus;
      note?: string;
    }) => {
      const { error } = await supabase
        .from(table)
        .update({ approval_status: status, review_note: note ?? null, reviewed_by: await currentUser() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["series"] });
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["tournament"] });
    },
  });
}
