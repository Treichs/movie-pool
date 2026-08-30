"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeasonOption } from "@/lib/season-schedule";

/**
 * THE SEASON PICKER — sticky note 1: a header control, not a left rail.
 *
 * It is the vendored `ui/select` rather than a dropdown built for this page.
 * Choosing a season is a navigation, so it pushes rather than setting state: a
 * season has its own address, and the back button should return you to the one
 * you came from.
 *
 * Hidden when a league has only ever run one season — a picker with one option
 * is a control that cannot do anything.
 */
export function SeasonPicker({
  current,
  options,
}: {
  current: string;
  options: SeasonOption[];
}) {
  const router = useRouter();
  if (options.length < 2) return null;

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        if (v && v !== current) router.push(`/seasons/${v}`);
      }}
    >
      <SelectTrigger size="sm" aria-label="Choose a season">
        <SelectValue>
          {(v) => options.find((o) => o.id === v)?.name ?? "Season"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
