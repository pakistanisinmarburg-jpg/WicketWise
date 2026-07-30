import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { AuditLog, CorrectionRequest, Match, RequestStatus, UUID } from "@/lib/types";

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
};

const currentUser = async () => (await supabase.auth.getUser()).data.user?.id ?? null;

/* ------------------------------------------------------- verification chain */
/** Scorer submits → captain verifies → (optional) admin verifies → official. */
export function useSubmitScorecard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: UUID) => {
      const uid = await currentUser();
      const { error } = await supabase
        .from("matches")
        .update({
          state: "COMPLETED",
          status: "completed",
          submitted_by: uid,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", matchId);
      if (error) throw new Error(error.message);
      await supabase.from("audit_logs").insert({
        actor_id: uid,
        action: "SCORECARD_SUBMITTED",
        entity_table: "matches",
        entity_id: matchId,
        match_id: matchId,
        after_value: { state: "COMPLETED" },
      });
    },
    onSuccess: () => invalidateMatch(qc),
  });
}

export function useVerifyScorecard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, asAdmin }: { matchId: UUID; asAdmin?: boolean }) => {
      const uid = await currentUser();
      const patch = asAdmin
        ? { admin_verified_by: uid, admin_verified_at: new Date().toISOString() }
        : { state: "VERIFIED", verified_by: uid, verified_at: new Date().toISOString() };
      const { error } = await supabase.from("matches").update(patch).eq("id", matchId);
      if (error) throw new Error(error.message);
      await supabase.from("audit_logs").insert({
        actor_id: uid,
        action: asAdmin ? "ADMIN_VERIFIED" : "CAPTAIN_VERIFIED",
        entity_table: "matches",
        entity_id: matchId,
        match_id: matchId,
        after_value: patch,
      });
    },
    onSuccess: () => invalidateMatch(qc),
  });
}

/** Flag a high-stakes match so captain verification alone doesn't make stats official. */
export function useSetAdminVerificationRequired() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, required }: { matchId: UUID; required: boolean }) => {
      const { error } = await supabase
        .from("matches")
        .update({ requires_admin_verification: required })
        .eq("id", matchId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateMatch(qc),
  });
}

function invalidateMatch(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["match"] });
  qc.invalidateQueries({ queryKey: ["matches"] });
  qc.invalidateQueries({ queryKey: ["match_results"] });
  qc.invalidateQueries({ queryKey: ["can_score"] });
  qc.invalidateQueries({ queryKey: ["audit_logs"] });
}

/** True once statistics from this match count as official. */
export const statsOfficial = (m?: Match | null) =>
  Boolean(m && (m.requires_admin_verification ? m.admin_verified_at : m.verified_at));

/* ------------------------------------------------------- correction requests */
export const useCorrectionRequests = (matchId?: UUID) =>
  useQuery({
    queryKey: ["correction_requests", matchId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("correction_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (matchId) q = q.eq("match_id", matchId);
      return unwrap<CorrectionRequest[]>(await q);
    },
  });

export function useFileCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      match_id: UUID;
      delivery_id?: UUID | null;
      field: string;
      current_value: string;
      requested_value: string;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("correction_requests")
        .insert({ ...input, requested_by: await currentUser() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correction_requests"] }),
  });
}

/**
 * Approving applies the requested value to the delivery and writes the
 * before/after pair to the audit trail — rejecting only records the decision.
 */
export function useReviewCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      request,
      status,
      note,
    }: {
      request: CorrectionRequest;
      status: Exclude<RequestStatus, "pending">;
      note?: string;
    }) => {
      const uid = await currentUser();
      let before: Record<string, unknown> | null = null;
      let after: Record<string, unknown> | null = null;

      if (status === "approved" && request.delivery_id && request.field) {
        const existing = await supabase
          .from("deliveries")
          .select("*")
          .eq("id", request.delivery_id)
          .maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        before = (existing.data ?? null) as Record<string, unknown> | null;

        const raw = request.requested_value;
        const numeric = ["runs_off_bat", "extra_runs"].includes(request.field);
        const value = raw === "" || raw === null ? null : numeric ? Number(raw) : raw;
        after = { [request.field]: value };

        const upd = await supabase
          .from("deliveries")
          .update(after)
          .eq("id", request.delivery_id);
        if (upd.error) throw new Error(upd.error.message);
      }

      const { error } = await supabase
        .from("correction_requests")
        .update({
          status,
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
          review_note: note ?? null,
          applied_at: status === "approved" ? new Date().toISOString() : null,
        })
        .eq("id", request.id);
      if (error) throw new Error(error.message);

      await supabase.from("audit_logs").insert({
        actor_id: uid,
        action: status === "approved" ? "CORRECTION_APPLIED" : "CORRECTION_REJECTED",
        entity_table: "correction_requests",
        entity_id: request.id,
        match_id: request.match_id,
        before_value: before,
        after_value: after,
        reason: request.reason,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["correction_requests"] });
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["all_deliveries"] });
      qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
  });
}

/* ------------------------------------------------------------- audit trail */
export const useAuditLogs = (matchId?: UUID) =>
  useQuery({
    queryKey: ["audit_logs", matchId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (matchId) q = q.eq("match_id", matchId);
      return unwrap<AuditLog[]>(await q);
    },
  });
