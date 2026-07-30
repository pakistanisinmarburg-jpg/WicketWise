import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { ScoringPermission, UUID } from "@/lib/types";

/** Active (non-revoked) scoring grants for the signed-in user. */
export const useMyScoringAssignments = (userId: UUID | undefined) =>
  useQuery({
    queryKey: ["scoring_permissions", "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scoring_permissions")
        .select("*")
        .eq("user_id", userId!)
        .eq("revoked", false);
      if (error) throw new Error(error.message);
      return (data ?? []) as ScoringPermission[];
    },
  });
