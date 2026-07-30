import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Shield, Star, Sun, User } from "lucide-react";
import type { ReactNode } from "react";

import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth-context";
import { ADMIN_NAV, CAPTAIN_NAV, PLAYER_NAV, PUBLIC_NAV, SCORER_NAV } from "@/features/nav";
import { useMyScoringAssignments } from "@/features/scoring-assignments";
import { useTheme } from "@/features/theme/theme-provider";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const { user, signOut, isAdmin, isCaptain, needsOnboarding } = useAuth();
  const assignments = useMyScoringAssignments(user?.id);

  const bare = pathname === "/auth" || pathname.endsWith("/score");
  if (bare) return <>{children}</>;

  // A pure scorer — someone with a live assignment but no captain or admin
  // rights — gets a deliberately stripped-back navigation.
  const scorerOnly = Boolean(user && !isCaptain && !isAdmin && (assignments.data ?? []).length > 0);

  const workspace = isAdmin
    ? ADMIN_NAV
    : isCaptain
      ? CAPTAIN_NAV
      : scorerOnly
        ? SCORER_NAV
        : user
          ? PLAYER_NAV
          : [];

  const mainNav = scorerOnly ? SCORER_NAV : PUBLIC_NAV;
  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
              W
            </span>
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">
              Wicket<span className="text-gold">Wise</span>
            </span>
          </Link>

          <nav className="ml-1 hidden items-center gap-0.5 lg:flex">
            {mainNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active(item.to) && "bg-primary/10 text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <GlobalSearch />
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <NotificationBell />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {isAdmin ? (
                      <Shield className="size-4" />
                    ) : isCaptain ? (
                      <Star className="size-4 fill-gold text-gold" />
                    ) : (
                      <User className="size-4" />
                    )}
                    <span className="hidden sm:inline">
                      {isAdmin ? "Admin" : isCaptain ? "Captain" : scorerOnly ? "Scorer" : "Player"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Your workspace</DropdownMenuLabel>
                  {workspace.map((item) => (
                    <DropdownMenuItem key={item.to + item.label} asChild>
                      <Link to={item.to}>
                        <item.icon className="size-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  {!scorerOnly && (
                    <DropdownMenuItem asChild>
                      <Link to="/profile">
                        <User className="size-4" /> Profile & availability
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm text-warning-foreground">
          Supabase isn't connected yet.{" "}
          <Link to="/setup" className="font-semibold underline">
            Finish setup
          </Link>{" "}
          to load real data.
        </div>
      )}

      {needsOnboarding && pathname !== "/onboarding" && (
        <div className="border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm">
          Your player profile isn't finished.{" "}
          <Link to="/onboarding" className="font-semibold underline">
            Complete registration
          </Link>{" "}
          to appear in the selection pool.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-14">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <div className={cn("grid", scorerOnly ? "grid-cols-4" : "grid-cols-5")}>
          {(scorerOnly ? SCORER_NAV : PUBLIC_NAV.slice(0, 4)).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
                active(item.to) && "text-primary",
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
          {!scorerOnly && (
            <Link
              to={user ? "/dashboard" : "/auth"}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
                active("/dashboard") && "text-primary",
              )}
            >
              <User className="size-5" />
              {user ? "You" : "Sign in"}
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
