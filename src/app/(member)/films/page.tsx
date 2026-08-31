import Link from "next/link";

import { FilmIndexList } from "@/components/film-index-list";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getFilmIndex } from "@/lib/film-index";

export const metadata = { title: "Films" };

/**
 * `/films` — every film played in any league this viewer belongs to.
 *
 * ── IT EXISTS BECAUSE `/films/[tmdbId]` HAD NO PARENT ────────────────────
 * IA §7.5 rule 5: every truncation must land on a real page. Chopping the id
 * off a film address gave a 404 until 2026-08-31. The rule that made adding a
 * page feel like amending a settled document was removed the same day — the
 * route set is open, the SHAPE is what is fixed.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 * Not the catalogue. `film_catalog` is a cache of films someone picked, and
 * listing it would show what other people's leagues have been playing. This
 * page means "films that have been played, in leagues you are in", which is
 * the only reading of "films" a signed-in member actually has.
 *
 * ── THE CHILD IS BROADER THAN THE PARENT, ON PURPOSE ─────────────────────
 * `/films/[tmdbId]` renders any film TMDB knows, including one the
 * commissioner is only considering. Such a film is not listed here, because it
 * has not been played. The page says what it holds and the child still stands
 * alone; a parent that had to contain every child would have to be the whole
 * of TMDB.
 */
export default async function FilmsPage() {
  const { supabase } = await requireUser();
  const films = await getFilmIndex(supabase);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex max-w-measure-page flex-col gap-6 px-8 py-8"
    >
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Films</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1>Films</h1>
        <p className="type-dek text-dek text-muted-foreground">
          {films.length === 0
            ? "Every film your leagues have played."
            : `${films.length} film${films.length === 1 ? "" : "s"} across your leagues, newest first.`}
        </p>
      </div>

      {films.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing has been played yet</EmptyTitle>
            <EmptyDescription>
              Films land here once a week opens with a slate on it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <FilmIndexList films={films} showLeague />
      )}
    </main>
  );
}
