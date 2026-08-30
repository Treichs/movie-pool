"use client";

import { useTransition } from "react";
import Link from "next/link";
import { InfoIcon, MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsFrom, numberWord } from "@/lib/format";
import type { ActionResult } from "@/lib/action-result";
import type { LeagueMember } from "@/lib/league";

import {
  demoteLeagueCommissioner,
  handoffLeagueCommissioner,
  promoteLeagueCommissioner,
  removeLeagueMember,
} from "../actions";

/**
 * MEMBERS & ROLES — board 4.11's third section, and the only place ADR-060's
 * guarantees can actually be violated.
 *
 * ── THE NEVER-ZERO RULE IS STATED HERE BECAUSE IT IS SAID NOWHERE ELSE ──
 * "A league always has at least one commissioner" is enforced in three RPCs
 * and printed in no UI in the product. A settings page is the first surface
 * where it has somewhere to be explained, and the sentence changes with the
 * count — a sole commissioner is told they must hand over rather than step
 * down, which is the actual shape of their only exit.
 *
 * ── THE MENU OFFERS; THE DATABASE DECIDES ──────────────────────────────
 * "Step down" is hidden for a sole commissioner because `demote` would refuse
 * it and a control that cannot work is worse than an absent one. That is a
 * COURTESY, not the check: `demote_league_commissioner` and
 * `remove_league_member` both refuse on the last commissioner regardless, and
 * `promote` requires the caller to already hold the role. Nothing here
 * re-implements any of it.
 *
 * ── ACTIONS ARE INVOKED DIRECTLY INSIDE `startTransition` ──────────────
 * A menu item is not a form, so there is no `useActionState`. This is React's
 * documented pattern for an action outside one, and it keeps `pending` honest.
 */
export function MembersSection({
  leagueId,
  members,
  commissionerCount,
  myMemberId,
}: {
  leagueId: string;
  members: LeagueMember[];
  commissionerCount: number;
  myMemberId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else if (result.notice) toast.success(result.notice);
    });

  const sole = commissionerCount === 1;
  const commissioners = members.filter((m) => m.role === "commissioner");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2>Members &amp; roles</h2>
        <span className="type-body text-micro text-muted-foreground">
          {numberWord(members.length)} member
          {members.length === 1 ? "" : "s"} ·{" "}
          {numberWord(commissionerCount)} commissioner
          {commissionerCount === 1 ? "" : "s"}
        </span>
      </div>

      <Card variant="flat" className="gap-0 p-0">
        <ul className="flex flex-col">
          {members.map((m) => {
            const isMe = m.id === myMemberId;
            const isCommissioner = m.role === "commissioner";
            // A sole commissioner cannot step down or be removed — the RPCs
            // refuse it, so the menu does not offer it.
            const canDemote = isCommissioner && !sole;
            const canRemove = !(isCommissioner && sole);

            return (
              <li
                key={m.id}
                className={`flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0 ${
                  isMe ? "bg-muted" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-8 rounded">
                    <AvatarFallback
                      className={`type-micro rounded text-micro ${isMe ? "bg-foreground text-background" : "bg-muted"}`}
                    >
                      {initialsFrom(m.profile.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <Link
                      href={`/players/${m.profile.id}`}
                      className={`truncate text-ui hover:underline ${isMe ? "type-ui font-semibold" : "type-ui"}`}
                    >
                      {m.profile.display_name}
                    </Link>
                    <span className="type-body truncate text-micro text-muted-foreground">
                      {m.profile.email}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={isCommissioner ? "ink" : "outline"}>
                    {isCommissioner ? "Commissioner" : "Player"}
                  </Badge>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={`Manage ${m.profile.display_name}`}
                        />
                      }
                    >
                      <MoreVerticalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isCommissioner && (
                        <DropdownMenuItem
                          onClick={() =>
                            run(() =>
                              promoteLeagueCommissioner(leagueId, m.id)
                            )
                          }
                        >
                          Make commissioner
                        </DropdownMenuItem>
                      )}
                      {canDemote && (
                        <DropdownMenuItem
                          onClick={() =>
                            run(() => demoteLeagueCommissioner(leagueId, m.id))
                          }
                        >
                          {isMe ? "Step down" : "Make player"}
                        </DropdownMenuItem>
                      )}
                      {/* The sole commissioner's only exit: hand the role to
                          somebody else and step down in one call, which never
                          passes through zero. Offered on the OTHER person's
                          row, because they are who it goes to. */}
                      {sole && !isCommissioner && myMemberId !== null && (
                        <DropdownMenuItem
                          onClick={() =>
                            run(() =>
                              handoffLeagueCommissioner(leagueId, m.id)
                            )
                          }
                        >
                          Hand the league over to them
                        </DropdownMenuItem>
                      )}
                      {canRemove && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              run(() => removeLeagueMember(leagueId, m.id))
                            }
                          >
                            Remove from league
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* THE GUARANTEE, SAID WHERE IT CAN BE VIOLATED. The wording follows the
          count, because "you can step down" is false for a sole commissioner
          and is exactly the person who needs to know what to do instead. */}
      <div className="flex items-start gap-2.5">
        <InfoIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="type-body text-micro text-muted-foreground">
          A league always has at least one commissioner.{" "}
          {sole
            ? "You are the only one, so you cannot step down or be removed — you would have to hand the league over to somebody else instead."
            : `You can step down while ${otherCommissionerName(commissioners, myMemberId)} holds the role.`}
        </span>
      </div>
    </section>
  );
}

function otherCommissionerName(
  commissioners: LeagueMember[],
  myMemberId: string | null
) {
  const other = commissioners.find((c) => c.id !== myMemberId);
  return other?.profile.display_name ?? "another commissioner";
}
