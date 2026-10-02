"use client";

import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/lib/actions/auth";

export function AccountMenu({ displayName }: { displayName: string }) {
  const item =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-3";
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm hover:border-line-strong"
        aria-label="Account menu"
      >
        <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-xs font-semibold text-white">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="font-medium">{displayName}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-48 rounded-xl border border-line-strong bg-surface-2 p-1.5 shadow-2xl"
        >
          <Menu.Item asChild>
            <Link href="/account" className={item}>
              <UserRound className="size-4 text-muted" /> My Account
            </Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link href="/account#change-pin" className={item}>
              <KeyRound className="size-4 text-muted" /> Change PIN
            </Link>
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <form action={signOut}>
            <Menu.Item asChild onSelect={(e) => e.preventDefault()}>
              <button type="submit" className={item}>
                <LogOut className="size-4 text-muted" /> Sign Out
              </button>
            </Menu.Item>
          </form>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
