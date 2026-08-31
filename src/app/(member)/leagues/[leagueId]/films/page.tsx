import { notFound } from "next/navigation";
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
import { getLeague } from "@/lib/league";

export const metadata = { title: "Films" };

/**
 * `/leagues/[leagueId]/films` — this league's filmography.
 *
 * The parent `/leagues/[leagueId]/films/[tmdbId]` never had. Its absence was
 * the other half of the §7.5 rule 5 break; see `/films` for the rest.
 *
 * ── THE RECORD BOOK IS NOT THIS PAGE ─────────────────────────────────────
 * `/leagues/[leagueId]/records` looks like the obvious parent and is not: it
 * is superlatives — best film, worst film, careers — and answers "what are the
 * extremes", where this answers "what have we played". Redirecting one to the
 * other would satisfy the rule by the letter and lose the question.
 *
 * ── THE GATE IS RLS, VIA `getLeague` ─────────────────────────────────────
 * A league the viewer is not in comes back null and this 404s, which is the
 * same shape the league overview uses. `getFilmIndex` is scoped by the same
 * policies, so even a leaked id returns an empty list rather than a slate.
 */
export default async function LeagueFilmsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase } = await requireUser();

  const [league, films] = await Promise.all([
    getLeague(supabase, leagueId),
    getFilmIndex(supabase, leagueId),
  ]);
  if (!league) notFound();

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
            <BreadcrumbLink render={<Link href={`/leagues/${leagueId}`} />}>
              {league.name}
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
            ? `Every film ${league.name} has played.`
            : `${films.length} film${films.length === 1 ? "" : "s"} ${league.name} has played, newest first.`}
        </p>
      </div>

      {films.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No films yet</EmptyTitle>
            <EmptyDescription>
              They land here once a week opens with a slate on it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <FilmIndexList films={films} showLeague={false} />
      )}
    </main>
  );
}
