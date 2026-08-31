"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  EMPTY_RESULTS,
  isEmpty,
  type SearchHit,
  type SearchResults,
} from "@/lib/search";

import { searchAction } from "../actions";

/**
 * THE SHELL'S SEARCH — a command palette, opened from band 1 or with ⌘K.
 *
 * ── IT LIVES IN THE INK BAR, NOT THE NAV BAND ─────────────────────────────
 * The nav band below is `hidden md:flex`, so a search box placed there would
 * simply not exist on a phone — and a control that disappears at one width is
 * worse than one that never moves. Band 1 is on every screen, which is also
 * why this is a button rather than a text field: a full input would take the
 * width the wordmark, the bell and the account menu already share.
 *
 * ── `shouldFilter={false}` IS LOAD-BEARING ────────────────────────────────
 * cmdk filters its own children by default, which would take the results the
 * database already matched and hide the ones whose match was on a field the
 * label does not print — a film matched on its title but listed under a league
 * name, a week matched on its number. The server ran the search; this only
 * draws it.
 *
 * ── EVERY ROW SAYS WHICH LEAGUE IT IS FROM ────────────────────────────────
 * Results are scoped to the viewer by RLS but NOT to the focused league (see
 * `lib/search`), so a member of several leagues will see two films with the
 * same name. `context` is what tells them apart, and it is not decoration.
 */
export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced, and the ANSWER IS ORDER-CHECKED rather than just delayed: two
  // in-flight actions can return out of order, and the older one landing last
  // would leave the list showing results for a prefix of what is on screen.
  useEffect(() => {
    if (!open) return;
    const q = query;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await searchAction(q);
        if (ticket === latest.current) setResults(r);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setResults(EMPTY_RESULTS);
    router.push(href);
  }

  const groups: { heading: string; hits: SearchHit[] }[] = [
    { heading: "Leagues", hits: results.leagues },
    { heading: "Seasons", hits: results.seasons },
    { heading: "Weeks", hits: results.weeks },
    { heading: "Films", hits: results.films },
    { heading: "Players", hits: results.players },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="relative flex size-11 items-center justify-center rounded-4xl text-nav-foreground outline-none hover:bg-nav-foreground/10 focus-visible:ring-3 focus-visible:ring-nav-foreground/30"
      >
        <SearchIcon aria-hidden className="size-5" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Find a league, season, week, film or player you can see."
      >
        {/* `CommandDialog` renders its children straight into the dialog with
            no `Command` around them, so the wrapper is the caller's to supply
            — cmdk's Input and List need that context to exist. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search leagues, seasons, weeks, films, players…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {/* A group whose query errored says so. It used to be dropped, which
                made a broken filter look exactly like "nothing matched". */}
            {results.failed.length > 0 && (
              <div className="px-3 py-2 text-ui text-destructive">
                Couldn&rsquo;t search {results.failed.join(", ")}. The rest is below.
              </div>
            )}
            {results.tooShort ? (
              <CommandEmpty>Type at least two characters.</CommandEmpty>
            ) : isEmpty(results) ? (
              <CommandEmpty>
                {pending
                  ? "Searching…"
                  : `Nothing you can see matches “${query.trim()}”.`}
              </CommandEmpty>
            ) : null}

            {groups.map(({ heading, hits }) =>
              hits.length === 0 ? null : (
                <CommandGroup key={heading} heading={heading}>
                  {hits.map((hit) => (
                    <CommandItem
                      key={hit.key}
                      value={hit.key}
                      onSelect={() => go(hit.href)}
                    >
                      <span className="truncate">{hit.label}</span>
                      {hit.context && (
                        <span className="ml-auto truncate pl-4 text-micro type-micro text-muted-foreground">
                          {hit.context}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ),
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
