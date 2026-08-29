import Link from "next/link";

/**
 * THE RIGHT COLUMN — two small panels the board draws, and both are for the
 * person who has just arrived rather than the one who plays every week.
 *
 * "Getting started" points at `/how-it-works#faq`, which is why that anchor is
 * load-bearing on that page: it is linked from here and nowhere else.
 */
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-4">
      <h2 className="type-eyebrow text-eyebrow text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

const LINK = "type-ui text-ui text-link underline underline-offset-4";

export function SidePanels({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Getting started">
        <div className="flex flex-col gap-2.5">
          <Link href="/how-it-works" className={LINK}>
            How the pool works
          </Link>
          <Link href="/how-it-works#faq" className={LINK}>
            The rules worth knowing
          </Link>
          <Link href="/leagues/new" className={LINK}>
            Starting your own league
          </Link>
        </div>
      </Panel>

      <Panel title="Your account">
        <p className="type-body text-ui text-muted-foreground">
          Signed in as <span className="text-foreground">{email}</span>
        </p>
        <Link href="/account" className={LINK}>
          Account settings
        </Link>
      </Panel>
    </div>
  );
}
