import Image from "next/image";
import { UserIcon } from "lucide-react";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { FilmCredit } from "@/lib/film-page";
import { profileUrl } from "@/lib/tmdb-urls";

/**
 * TOP BILLING — board 2.2 draws six, and six is the number.
 *
 * The catalogue holds the whole cast; a catalog page is not a filmography, and
 * a second row of names is where a reader stops reading. `cast` arrives sorted
 * by billing from `getFilmPage`, so the six are the top six.
 */
const BILLED = 6;

export function FilmCast({ cast }: { cast: FilmCredit[] }) {
  const billed = cast.slice(0, BILLED);
  if (billed.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <h2>Cast</h2>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {billed.map((c) => {
          const photo = profileUrl(c.profile_path);
          return (
            <li key={`${c.billing}-${c.name}`} className="flex flex-col gap-1.5">
              <AspectRatio
                ratio={1}
                className="overflow-hidden rounded bg-muted"
              >
                {photo ? (
                  <Image
                    src={photo}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 8rem, 30vw"
                    className="object-cover object-top"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <UserIcon
                      className="size-5 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
              </AspectRatio>
              {/* NOT `type-micro`: that utility uppercases, which is right for
                  a label and wrong for a person's name. Only the SIZE token is
                  wanted here. */}
              <span className="type-ui text-micro">{c.name}</span>
              {c.character_name && (
                <span className="type-body text-micro text-muted-foreground">
                  {c.character_name}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
