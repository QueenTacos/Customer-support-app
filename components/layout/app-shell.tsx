"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { AccountMenu } from "./account-menu";
import { GlobalSearch } from "./global-search";

export function AppShell({
  appName,
  displayName,
  children,
}: {
  appName: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-sidebar lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar appName={appName} />
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-sidebar">
            <button
              className="absolute right-3 top-4 rounded-md p-1.5 text-muted hover:text-ink"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <Sidebar appName={appName} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-8">
          <button
            className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <GlobalSearch key={pathname} />
          </div>
          <AccountMenu displayName={displayName} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
