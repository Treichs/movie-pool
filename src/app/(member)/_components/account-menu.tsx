"use client";

import Link from "next/link";
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { PlayerAvatar } from "@/components/player-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The account menu, on the ink band.
 *
 * SIGN OUT IS A FORM, not an onClick. `signOut` is a server action that clears
 * the Supabase cookie and redirects, and a fetch-and-hope button would leave a
 * stale session in the tab whenever JavaScript had not loaded yet. The form
 * posts, the action redirects, and the browser has always known how to do that.
 */
export function AccountMenu({
  name,
  email,
  profileId,
}: {
  name: string;
  email: string;
  profileId: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-11 items-center gap-2 rounded-4xl py-1 pr-2 pl-1 text-nav-foreground outline-none hover:bg-nav-foreground/10 focus-visible:ring-3 focus-visible:ring-nav-foreground/30"
        aria-label={`Account — ${name}`}
      >
        <PlayerAvatar id={profileId} name={name} className="size-8" />
        <span className="type-ui hidden text-ui md:inline">{name}</span>
        <ChevronsUpDownIcon className="size-4 text-nav-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <span className="type-ui text-ui">{name}</span>
          <span className="type-body text-micro text-muted-foreground">{email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`/players/${profileId}`} />}>
          <UserIcon aria-hidden />
          Your profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account" />}>
          <SettingsIcon aria-hidden />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <form action={signOut}>
              <button type="submit" className="flex w-full items-center gap-2.5">
                <LogOutIcon className="size-4" aria-hidden />
                Sign out
              </button>
            </form>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
