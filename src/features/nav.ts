import {
  Award,
  BarChart3,
  Bell,
  CircleDot,
  ClipboardCheck,
  Gauge,
  Home,
  Medal,
  Radio,
  Shield,
  Star,
  Swords,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
export type NavItem = { to: string; label: string; icon: LucideIcon };
/** Visible to everyone, signed in or not. */
export const PUBLIC_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/live", label: "Live", icon: Radio },
  { to: "/matches", label: "Matches", icon: CircleDot },
  { to: "/players", label: "Players", icon: Users },
  { to: "/teams", label: "Teams", icon: Trophy },
  { to: "/series", label: "Series", icon: Swords },
  { to: "/tournaments", label: "Cups", icon: Medal },
  { to: "/rankings", label: "Rankings", icon: BarChart3 },
  { to: "/records", label: "Records", icon: Award },
];
export const PLAYER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/notifications", label: "Notifications", icon: Bell },
];
export const CAPTAIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Captain dashboard", icon: Gauge },
  { to: "/teams", label: "My teams", icon: Trophy },
  { to: "/matches", label: "Matches", icon: CircleDot },
  { to: "/scoring", label: "Scoring", icon: ClipboardCheck },
  { to: "/rankings", label: "Analytics", icon: BarChart3 },
];
export const SCORER_NAV: NavItem[] = [
  { to: "/scoring", label: "Assigned", icon: ClipboardCheck },
  { to: "/live", label: "Live", icon: Radio },
  { to: "/notifications", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
];
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Admin console", icon: Shield },
  { to: "/scoring", label: "Live matches", icon: ClipboardCheck },
  { to: "/notifications", label: "Notifications", icon: Bell },
];
export const CAPTAIN_BADGE = Star;
