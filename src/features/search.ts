import { useQuery } from "@tanstack/react-query";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Match, Player, Series, Team, Tournament } from "@/lib/types";

export type SearchGroup = {
  label: string;
  to: string;
  items: { id: string; title: string; subtitle?: string | null; to: string }[];
};

const like = (term: string) => `%${term.replace(/[%_]/g, "")}%`;

/** One box, five grouped result sets — Players, Teams, Matches, Series, Cups. */
export function useGlobalSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ["global_search", q],
    enabled: isSupabaseConfigured && q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchGroup[]> => {
      const pattern = like(q);
      const [players, teams, matches, series, tournaments] = await Promise.all([
        supabase.from("players").select("*").ilike("full_name", pattern).limit(6),
        supabase.from("teams").select("*").or(`name.ilike.${pattern},short_name.ilike.${pattern}`).limit(6),
        supabase
          .from("matches")
          .select("*")
          .or(`title.ilike.${pattern},venue.ilike.${pattern}`)
          .order("match_date", { ascending: false })
          .limit(6),
        supabase.from("series").select("*").ilike("name", pattern).limit(6),
        supabase.from("tournaments").select("*").ilike("name", pattern).limit(6),
      ]);

      return [
        {
          label: "Players",
          to: "/players",
          items: ((players.data ?? []) as Player[]).map((p) => ({
            id: p.id,
            title: p.full_name,
            subtitle: p.role ?? p.batting_style,
            to: `/players/${p.id}`,
          })),
        },
        {
          label: "Teams",
          to: "/teams",
          items: ((teams.data ?? []) as Team[]).map((t) => ({
            id: t.id,
            title: t.name,
            subtitle: [t.short_name, t.city].filter(Boolean).join(" · "),
            to: `/teams/${t.id}`,
          })),
        },
        {
          label: "Matches",
          to: "/matches",
          items: ((matches.data ?? []) as Match[]).map((m) => ({
            id: m.id,
            title: m.title || "Match",
            subtitle: [m.venue, m.state].filter(Boolean).join(" · "),
            to: `/matches/${m.id}`,
          })),
        },
        {
          label: "Series",
          to: "/series",
          items: ((series.data ?? []) as Series[]).map((s) => ({
            id: s.id,
            title: s.name,
            subtitle: s.approval_status,
            to: `/series/${s.id}`,
          })),
        },
        {
          label: "Tournaments",
          to: "/tournaments",
          items: ((tournaments.data ?? []) as Tournament[]).map((t) => ({
            id: t.id,
            title: t.name,
            subtitle: t.format,
            to: `/tournaments/${t.id}`,
          })),
        },
      ].filter((g) => g.items.length > 0);
    },
  });
}
