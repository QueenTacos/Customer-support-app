"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headset } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, isActivePath } from "./nav-items";

export function Sidebar({ appName, onNavigate }: { appName: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex h-16 items-center gap-2.5 border-b border-line px-5"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-[var(--shadow-glow)]">
          <Headset className="size-4.5 text-white" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">{appName}</span>
      </Link>

      <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary-soft font-medium text-ink ring-1 ring-inset ring-primary/30"
                    : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon className={cn("size-4.5", active ? "text-primary-bright" : "text-faint group-hover:text-muted")} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.comingInPhase && (
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                    Soon
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
