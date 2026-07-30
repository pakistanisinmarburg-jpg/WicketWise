import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app has real Supabase credentials to talk to. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Single Supabase client for the whole app. Standard @supabase/supabase-js —
 * no platform-specific wrappers, so this repo runs unchanged on Vercel.
 */
export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
