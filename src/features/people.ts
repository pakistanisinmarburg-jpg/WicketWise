import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type {
  AppRole,
  CaptainRequest,
  Profile,
  ScoringPermission,
  UserRole,
  UUID,
} from "@/lib/types";

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
};

/* ----------------------------------------------------------------- profiles */
export const useProfile = (userId: UUID | undefined) =>
  useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as Profile | null;
    },
  });

export const useProfiles = () =>
  useQuery({
    queryKey: ["profiles"],
    queryFn: async () =>
      unwrap<Profile[]>(await supabase.from("profiles").select("*").order("full_name")),
  });

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: UUID; patch: Partial<Profile> }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["players"] });
    },
  });
}

/** Uploads to the public `avatars` bucket under the user's own folder. */
export function useUploadAvatar() {
  return useMutation({
    mutationFn: async ({ userId, file }: { userId: UUID; file: File }) => {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    },
  });
}

/* -------------------------------------------------------------------- roles */
export const useUserRoles = () =>
  useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => unwrap<UserRole[]>(await supabase.from("user_roles").select("*")),
  });

export const useMyRoles = (userId: UUID | undefined) =>
  useQuery({
    queryKey: ["user_roles", "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap<UserRole[]>(
        await supabase.from("user_roles").select("*").eq("user_id", userId!),
      );
      return rows.map((r) => r.role) as AppRole[];
    },
  });

/* -------------------------------------------------------- captain requests */
export const useMyCaptainRequest = (userId: UUID | undefined) =>
  useQuery({
    queryKey: ["captain_requests", "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("captain_requests")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as CaptainRequest | null;
    },
  });

export const useCaptainRequests = () =>
  useQuery({
    queryKey: ["captain_requests"],
    queryFn: async () =>
      unwrap<CaptainRequest[]>(
        await supabase.from("captain_requests").select("*").order("created_at", { ascending: false }),
      ),
  });

export function useRequestCaptain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, message }: { userId: UUID; message: string }) => {
      const { error } = await supabase
        .from("captain_requests")
        .insert({ user_id: userId, message: message || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captain_requests"] }),
  });
}

export function useReviewCaptainRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reviewerId,
    }: {
      id: UUID;
      status: "approved" | "rejected";
      reviewerId: UUID;
    }) => {
      const { error } = await supabase
        .from("captain_requests")
        .update({ status, reviewed_by: reviewerId })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["captain_requests"] });
      qc.invalidateQueries({ queryKey: ["user_roles"] });
    },
  });
}

/* ------------------------------------------------------ scoring permissions */
export const useScoringPermissions = (matchId: UUID) =>
  useQuery({
    queryKey: ["scoring_permissions", matchId],
    queryFn: async () =>
      unwrap<ScoringPermission[]>(
        await supabase.from("scoring_permissions").select("*").eq("match_id", matchId),
      ),
  });

export function useGrantScoring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      matchId,
      userId,
      grantedBy,
    }: {
      matchId: UUID;
      userId: UUID;
      grantedBy: UUID;
    }) => {
      const { error } = await supabase
        .from("scoring_permissions")
        .upsert(
          { match_id: matchId, user_id: userId, granted_by: grantedBy, revoked: false },
          { onConflict: "match_id,user_id" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scoring_permissions"] }),
  });
}

export function useRevokeScoring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const { error } = await supabase
        .from("scoring_permissions")
        .update({ revoked: true })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scoring_permissions"] }),
  });
}

/** Client-side mirror of the SQL `can_score_match` predicate (RLS still rules). */
export const useCanScore = (
  matchId: UUID,
  opts: { userId?: UUID; isAdmin: boolean; matchCreatedBy?: string | null; matchStatus?: string },
) =>
  useQuery({
    queryKey: ["can_score", matchId, opts.userId],
    enabled: Boolean(opts.userId && matchId),
    queryFn: async () => {
      if (opts.isAdmin || (opts.matchCreatedBy && opts.matchCreatedBy === opts.userId)) return true;
      if (opts.matchStatus === "completed" || opts.matchStatus === "abandoned") return false;
      const { data, error } = await supabase
        .from("scoring_permissions")
        .select("id")
        .eq("match_id", matchId)
        .eq("user_id", opts.userId!)
        .eq("revoked", false)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });
