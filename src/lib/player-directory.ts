// Who the viewer can see, by ID — the client-side half of ADR-082.
//
// PURE on purpose (no React, no Supabase): lib/player-profile builds it from an
// RPC, components/avatar-overrides provides it, and scripts/unit tests the
// collision case without a database. Same split as lib/avatar-palette.
//
// WHY A NAME MAP STILL EXISTS. ADR-050's PlayerChip seam takes a `name` and
// resolves everything else from context, which is what let avatars and profile
// links reach twenty call sites without threading ids through fifteen queries.
// That trade is worth keeping; what is not worth keeping is what it did on a
// collision — it GUESSED, and it guessed silently.
//
// So the name map is built only from names that identify exactly one account.
// A name shared by two members is dropped from it entirely, and a chip with no
// id of its own falls back to the derived avatar and renders as plain text.
// That is a visibly smaller chip, not a wrong one: the failure mode ADR-082
// exists to kill is the plausible-looking wrong answer, and "no link" cannot be
// mistaken for "somebody else's link".

export type DirectoryEntry = { profileId: string; displayName: string };

export type PlayerDirectory = {
  /** profile id -> display name. Everyone the viewer shares a league with. */
  names: Record<string, string>;
  /** display name -> profile id, for UNAMBIGUOUS names only. See above. */
  ids: Record<string, string>;
};

export const EMPTY_DIRECTORY: PlayerDirectory = { names: {}, ids: {} };

export function buildPlayerDirectory(rows: DirectoryEntry[]): PlayerDirectory {
  const names: Record<string, string> = {};
  const ids: Record<string, string> = {};
  // A name is only usable as a key while it belongs to one account. The moment
  // a second id claims it, the entry is removed rather than overwritten —
  // last-write-wins is exactly the behaviour being fixed.
  const ambiguous = new Set<string>();

  for (const row of rows) {
    if (!row.profileId || !row.displayName) continue;
    names[row.profileId] = row.displayName;

    const claimed = ids[row.displayName];
    if (claimed === undefined) {
      ids[row.displayName] = row.profileId;
    } else if (claimed !== row.profileId) {
      ambiguous.add(row.displayName);
    }
  }

  for (const name of ambiguous) delete ids[name];
  return { names, ids };
}

/**
 * The account a chip is about: its own id when it has one, otherwise the name
 * — but only while that name is unambiguous.
 *
 * Returns null rather than a guess, and null is a real outcome: it means derive
 * the avatar and do not link.
 */
export function resolveProfileId(
  directory: PlayerDirectory,
  name: string,
  profileId?: string | null
): string | null {
  // An id passed by the call site wins outright, but must still be someone the
  // viewer can see — the old behaviour, where a name missing from the directory
  // rendered as plain text, was right and is preserved.
  if (profileId) return directory.names[profileId] !== undefined ? profileId : null;
  return directory.ids[name] ?? null;
}
