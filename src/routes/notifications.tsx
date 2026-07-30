import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
} from "@/features/notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notifications — WicketWise" },
      {
        name: "description",
        content: "Squad invitations, approvals, scoring assignments and match results in one feed.",
      },
      { property: "og:title", content: "Notifications — WicketWise" },
      { property: "og:description", content: "Everything that needs your attention." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useNotifications(user?.id);
  useNotificationsRealtime(user?.id);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  if (!user)
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="underline">
            Sign in
          </Link>{" "}
          to see your notifications.
        </CardContent>
      </Card>
    );

  if (notifications.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const rows = notifications.data ?? [];
  const unread = rows.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate(user.id)}>
            Mark all read
          </Button>
        )}
      </header>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 size-6 opacity-40" />
              Nothing here yet.
            </p>
          )}
          {rows.map((n) => {
            const inner = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {safeAgo(n.created_at)}
                </span>
              </>
            );
            const className = cn(
              "flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/50",
              !n.read && "bg-primary/5",
            );
            return n.link ? (
              <Link
                key={n.id}
                to={n.link}
                className={className}
                onClick={() => !n.read && markRead.mutate(n.id)}
              >
                {inner}
              </Link>
            ) : (
              <button key={n.id} className={className} onClick={() => markRead.mutate(n.id)}>
                {inner}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function safeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
