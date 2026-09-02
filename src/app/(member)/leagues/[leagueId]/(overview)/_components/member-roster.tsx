"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, PlusIcon } from "lucide-react";

import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { CareerRow } from "@/lib/league-records";

const FIRST = 5;

/** One member. The figures are tabular and column-width fixed so 6,412.9 and
 *  812.4 stack on their decimal — a list people read as a ranking must not read
 *  as ragged noise. */
function Row({ member }: { member: CareerRow }) {
  return (
    <Item
      size="sm"
      render={<Link href={`/players/${member.profileId}`} />}
      className={`rounded-none border-b last:border-b-0 hover:bg-muted ${member.isMe ? "bg-muted" : ""}`}
    >
      <ItemMedia>
        {/* THE PRIMITIVE, NOT A HAND-ROLLED CIRCLE. This drew one grey letter
            per member, so on the one screen that lists the whole league every
            person looked identical — the exact thing the derived-avatar system
            exists to prevent. `PlayerAvatar` takes two initials and a colour
            derived from the profile id. */}
        <PlayerAvatar
          id={member.profileId}
          name={member.name}
          isMe={member.isMe}
          className="size-6.5"
        />
      </ItemMedia>
      {/* `min-w-0` IS WHAT KEEPS THE COLUMNS COLUMNS. `Item` is a wrapping flex
          row and `flex-1` still refuses to shrink below its content, so a name
          carrying a "Commissioner" badge pushed the three figures onto a line
          of their own at phone width — the exact raggedness the fixed widths
          below exist to prevent. The name wraps inside its own cell instead. */}
      <ItemContent className="min-w-0 flex-row flex-wrap items-center gap-2.5">
        <ItemTitle className={member.isMe ? "type-h3 text-ui" : "type-ui text-ui"}>
          {member.name}
        </ItemTitle>
        {member.isMe && <Badge variant="secondary">You</Badge>}
        {member.isCommissioner && <Badge variant="ink">Commissioner</Badge>}
      </ItemContent>
      {/* Tabular and column-width fixed, so 6,412.9 and 812.4 stack on their
          decimal — a list people read as a ranking must not read as ragged. */}
      <ItemActions className="shrink-0 gap-3 sm:gap-6">
        <span className="type-numeral w-6 text-right text-ui text-muted-foreground">
          {member.seasons}
        </span>
        <span className="type-numeral w-6 text-right text-ui text-muted-foreground">
          {member.titles || "—"}
        </span>
        <span className="type-numeral w-20 text-right text-ui">
          {member.points.toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        </span>
      </ItemActions>
    </Item>
  );
}

/**
 * THE MEMBERS LIST, and the overflow is a real disclosure rather than a label.
 *
 * Board 4.2 ends the list with the words "Four more members" and no way to see
 * them. `ui/collapsible` was already vendored and unused on this screen, so the
 * overflow now opens — which is the whole difference between a caption and a
 * control.
 *
 * TITLES EARN THEIR COLUMN HERE because the seasons table cannot have one: the
 * champions roll was removed on the grounds that "the champions already read
 * off the career table", and this IS that table.
 */
export function MemberRoster({
  members,
  leagueId,
}: {
  members: CareerRow[];
  leagueId: string;
}) {
  const [open, setOpen] = useState(false);
  const head = members.slice(0, FIRST);
  const rest = members.slice(FIRST);

  return (
    <div className="rounded border bg-card">
      <ItemGroup>
        {head.map((m) => (
              <Row key={m.profileId} member={m} />
            ))}
      </ItemGroup>

      {rest.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleContent>
            <ItemGroup>
              {rest.map((m) => (
                <Row key={m.profileId} member={m} />
              ))}
            </ItemGroup>
          </CollapsibleContent>
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
            <CollapsibleTrigger
              className="type-micro flex items-center gap-1.5 text-micro text-muted-foreground hover:text-foreground"
              render={<button type="button" />}
            >
              {open
                ? "Show fewer"
                : `${rest.length} more member${rest.length === 1 ? "" : "s"}`}
              <ChevronDownIcon
                aria-hidden
                className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <Button
              render={<Link href={`/leagues/${leagueId}/settings`} />}
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              <PlusIcon />
              Invite someone
            </Button>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
