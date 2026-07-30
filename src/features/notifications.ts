import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Notification, UUID } from "@/lib/types";

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
};

export const useNotifications = (userId: UUID | undefined) =>
  useQuery({
    queryKey: ["notifications", userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap<Notification[]>(
        await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userId!)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
  });

/**
 * Keeps the bell live without polling.
 *
 * This hook mounts in more than one place at once (the header bell AND the
 * full /notifications page), so the channel name must be unique per
 * component instance -- Supabase's realtime client throws if you try to
 * `.subscribe()` a second channel with the same topic that's already
 * subscribed ("cannot add `postgres_changes` callbacks ... after
 * `subscribe()`"). A React-generated id keeps each mount's channel distinct.
 */
export function useNotificationsRealtime(userId: UUID | undefined) {
  const qc = useQueryClient();
  const instanceId = useId();
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    const channel = supabase
      .channel(`notifications:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc, instanceId]);
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: UUID) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("read", false);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Fire-and-forget notification used for events without a database trigger. */
export async function notifyUser(row: {
  user_id: UUID;
  kind: string;
  title: string;
  body?: string;
  link?: string;
}) {
  if (!isSupabaseConfigured) return;
  await supabase.from("notifications").insert(row);
}
