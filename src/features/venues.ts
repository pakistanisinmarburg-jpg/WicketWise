import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { UUID } from "@/lib/types";

export type Venue = {
  id: UUID;
  name: string;
  city: string | null;
  country: string | null;
  surface: string | null;
  capacity: number | null;
  notes: string | null;
  created_by: UUID | null;
  created_at: string;
};

export const useVenues = () =>
  useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("*").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Venue[];
    },
  });

export function useCreateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Venue> & { name: string }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from("venues").insert({ ...input, created_by: uid });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venues"] }),
  });
}

export function useDeleteVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const { error } = await supabase.from("venues").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venues"] }),
  });
}
