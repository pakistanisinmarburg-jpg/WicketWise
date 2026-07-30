import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/features/auth/auth-context";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
} from "@/features/notifications";
import { cn } from "@/lib/utils";

const ago = (iso: string) => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
};

export function NotificationBell() {
  const { user } = useAuth();
  const notifications = useNotifications(user?.id);
  useNotificationsRealtime(user?.id);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  if (!user) return null;
  const rows = notifications.data ?? [];
  const unread = rows.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-live text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => markAll.mutate(user.id)}
            >
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>
          )}
          {rows.slice(0, 20).map((n) => {
            const body = (
              <>
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{ago(n.created_at)}</p>
              </>
            );
            const className = cn(
              "block w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/60",
              !n.read && "bg-primary/5",
            );
            return n.link ? (
              <Link
                key={n.id}
                to={n.link}
                className={className}
                onClick={() => !n.read && markRead.mutate(n.id)}
              >
                {body}
              </Link>
            ) : (
              <button key={n.id} className={className} onClick={() => markRead.mutate(n.id)}>
                {body}
              </button>
            );
          })}
        </ScrollArea>
        <Link
          to="/notifications"
          className="block border-t px-3 py-2 text-center text-xs font-medium text-primary hover:underline"
        >
          See all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}
