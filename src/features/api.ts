import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  enqueue,
  flushQueue,
  isOnline,
  onQueueChange,
  pending,
  type QueuedOp,
} from "@/lib/offline-queue";
import { supabase } from "@/lib/supabase";
import type { Player, Team, TeamMember, Match, Innings, Delivery, UUID } from "@/lib/types";

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
};

/* ------------------------------------------------------------------ players */
export const playersQuery = {
  queryKey: ["players"],
  queryFn: async () =>
    unwrap<Player[]>(await supabase.from("players").select("*").order("full_name")),
};

export const usePlayers = () => useQuery(playersQuery);

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Player>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("players")
        .insert({ ...input, created_by: auth.user?.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["players"] }),
  });
}

/* -------------------------------------------------------------------- teams */
export const useTeams = () =>
  useQuery({
    queryKey: ["teams"],
    queryFn: async () => unwrap<Team[]>(await supabase.from("teams").select("*").order("name")),
  });

export const useTeamMembers = () =>
  useQuery({
    queryKey: ["team_members"],
    queryFn: async () => unwrap<TeamMember[]>(await supabase.from("team_members").select("*")),
  });

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Team>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("teams").insert({ ...input, created_by: auth.user?.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useSetTeamRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, playerIds }: { teamId: UUID; playerIds: UUID[] }) => {
      const del = await supabase.from("team_members").delete().eq("team_id", teamId);
      if (del.error) throw new Error(del.error.message);
      if (playerIds.length) {
        const ins = await supabase
          .from("team_members")
          .insert(playerIds.map((player_id) => ({ team_id: teamId, player_id })));
        if (ins.error) throw new Error(ins.error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

/* ------------------------------------------------------------------ matches */
export const useMatches = () =>
  useQuery({
    queryKey: ["matches"],
    queryFn: async () =>
      unwrap<Match[]>(
        await supabase.from("matches").select("*").order("match_date", { ascending: false }),
      ),
  });

export const useMatch = (id: UUID) =>
  useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as Match | null;
    },
  });

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Match>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("matches")
        .insert({ ...input, created_by: auth.user?.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Match;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matches"] }),
  });
}

export function useUpdateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: UUID; patch: Partial<Match> }) => {
      const { error } = await supabase.from("matches").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["match", v.id] });
    },
  });
}

/* ------------------------------------------------------- innings/deliveries */
export const useInnings = (matchId: UUID) =>
  useQuery({
    queryKey: ["innings", matchId],
    queryFn: async () =>
      unwrap<Innings[]>(
        await supabase
          .from("innings")
          .select("*")
          .eq("match_id", matchId)
          .order("innings_number"),
      ),
  });

export function useCreateInnings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Innings>) => {
      const { data, error } = await supabase.from("innings").insert(input).select().single();
      if (error) throw new Error(error.message);
      return data as Innings;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["innings", d.match_id] }),
  });
}

export const useDeliveries = (inningsIds: UUID[]) =>
  useQuery({
    queryKey: ["deliveries", inningsIds.slice().sort().join(",")],
    enabled: inningsIds.length > 0,
    queryFn: async () =>
      unwrap<Delivery[]>(
        await supabase
          .from("deliveries")
          .select("*")
          .in("innings_id", inningsIds)
          .order("over_number")
          .order("ball_number")
          .order("created_at"),
      ),
  });

/** Every innings row, used to map innings → match for career statistics. */
export const useAllInnings = () =>
  useQuery({
    queryKey: ["innings", "all"],
    queryFn: async () => unwrap<Innings[]>(await supabase.from("innings").select("*")),
  });

/** All deliveries ever bowled — the source of truth for career statistics. */
export const useAllDeliveries = () =>
  useQuery({
    queryKey: ["deliveries", "all"],
    queryFn: async () => unwrap<Delivery[]>(await supabase.from("deliveries").select("*")),
  });

/* ------------------------------------------------------- offline-first writes */
const applyOp = async (op: QueuedOp) => {
  if (op.kind === "insert") {
    const { error } = await supabase.from("deliveries").insert(op.row);
    // A duplicate primary key means the row already landed — treat it as done.
    if (error && !error.message.includes("duplicate key")) throw new Error(error.message);
  } else if (op.kind === "update") {
    const { error } = await supabase.from("deliveries").update(op.patch).eq("id", op.rowId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("deliveries").delete().eq("id", op.rowId);
    if (error) throw new Error(error.message);
  }
};

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Writes locally first, then syncs — the scoring client must survive no signal. */
export function useRecordDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Delivery>) => {
      const { data: auth } = await supabase.auth.getUser();
      const row: Partial<Delivery> = {
        id: newId(),
        scored_by: auth.user?.id ?? null,
        created_at: new Date().toISOString(),
        ...input,
      };
      await enqueue({ id: `ins-${row.id}`, kind: "insert", at: Date.now(), row });
      await flushQueue(applyOp);
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useUpdateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: UUID; patch: Partial<Delivery> }) => {
      await enqueue({ id: `upd-${id}-${Date.now()}`, kind: "update", at: Date.now(), rowId: id, patch });
      await flushQueue(applyOp);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useUndoDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: UUID) => {
      await enqueue({ id: `del-${deliveryId}`, kind: "delete", at: Date.now(), rowId: deliveryId });
      await flushQueue(applyOp);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

/** Drives the "Offline — X balls queued" indicator and the silent auto-sync. */
export function useSyncStatus() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(isOnline());
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const ops = await pending();
      if (alive) setQueued(ops.length);
    };
    const sync = async () => {
      const res = await flushQueue(applyOp);
      if (res.sent > 0) qc.invalidateQueries({ queryKey: ["deliveries"] });
      await refresh();
    };
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);

    void refresh();
    const unsub = onQueueChange(refresh);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => void sync(), 15000);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [qc]);

  return { online, queued };
}

