import {
  BarChart3,
  BookOpen,
  FileText,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  PlusCircle,
  ShieldAlert,
  Ticket,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase in which the page's real functionality ships (undefined = available now). */
  comingInPhase?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tickets/new", label: "New Ticket", icon: PlusCircle },
  { href: "/tickets", label: "Active Tickets", icon: Ticket },
  { href: "/limits", label: "LIMITS", icon: Gauge, comingInPhase: 3 },
  { href: "/claims", label: "Claims", icon: ShieldAlert, comingInPhase: 3 },
  { href: "/templates", label: "Templates", icon: FileText, comingInPhase: 3 },
  { href: "/product-rules", label: "Product Rules", icon: BookOpen, comingInPhase: 4 },
  { href: "/uat", label: "UAT", icon: FlaskConical, comingInPhase: 4 },
  { href: "/reports", label: "Reports", icon: BarChart3, comingInPhase: 5 },
];

export function isActivePath(pathname: string, href: string) {
  if (href === "/tickets") {
    return pathname === "/tickets" || (pathname.startsWith("/tickets/") && !pathname.startsWith("/tickets/new"));
  }
  return pathname === href || pathname.startsWith(href + "/");
}
