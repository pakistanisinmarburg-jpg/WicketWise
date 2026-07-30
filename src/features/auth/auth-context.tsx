import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useMyRoles, useProfile } from "@/features/people";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AppRole, Profile } from "@/lib/types";

type AuthValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  isCaptain: boolean;
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  roles: [],
  isAdmin: false,
  isCaptain: false,
  needsOnboarding: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const profile = useProfile(userId);
  const roles = useMyRoles(userId);
  const roleList = roles.data ?? [];

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        profile: profile.data ?? null,
        roles: roleList,
        isAdmin: roleList.includes("admin"),
        isCaptain: roleList.includes("captain") || roleList.includes("admin"),
        needsOnboarding: Boolean(profile.data && !profile.data.onboarding_complete),
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
