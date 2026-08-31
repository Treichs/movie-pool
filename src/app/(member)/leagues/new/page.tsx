import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requireUser } from "@/lib/auth";

import { CreateLeagueWizard } from "./_components/create-league-wizard";

export const metadata = { title: "Start a league" };

/**
 * `/leagues/new` — THE ONLY WAY A LEAGUE COMES INTO EXISTENCE.
 *
 * ── NO COMPOSER, AND NO READ AT ALL ───────────────────────────────────────
 * There is nothing to fetch: every value on the four steps is a default from
 * the rulebook or something the commissioner types. The gate is still here,
 * because `create_league` refuses an anonymous caller and a signed-out visitor
 * should meet `/login` rather than a form that cannot submit.
 *
 * ── THE WIZARD OWNS ITS OWN STATE, AND THE WRITE HAPPENS ONCE ─────────────
 * Four steps, one submit. Saving step by step would leave half-built leagues
 * behind every time somebody closed the tab on step three, and there is no
 * "draft league" concept for them to land in.
 *
 * ── THE BREADCRUMB IS THE §7.5 PROMISE MADE VISIBLE ───────────────────────
 * Chop `/leagues/new` and you get `/leagues`, which is a real page. The trail
 * says so rather than leaving it to be discovered.
 */
export default async function NewLeaguePage() {
  await requireUser();

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Start a league</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>Start a league</h1>
        <p className="text-muted-foreground">
          You will be its commissioner. Everything here can be changed later in
          league settings.
        </p>
      </div>

      <CreateLeagueWizard />
    </main>
  );
}
