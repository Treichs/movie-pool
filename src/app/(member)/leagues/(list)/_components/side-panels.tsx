import { TextLink } from "@/components/text-link";
import { Card } from "@/components/ui/card";

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
    <Card variant="flat" size="sm" className="gap-3">
      <h2 className="type-eyebrow text-eyebrow text-muted-foreground">
        {title}
      </h2>
      {children}
    </Card>
  );
}

export function SidePanels({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Getting started">
        <div className="flex flex-col gap-2.5">
          <TextLink href="/how-it-works" size="ui">
            How the pool works
          </TextLink>
          <TextLink href="/how-it-works#faq" size="ui">
            The rules worth knowing
          </TextLink>
          <TextLink href="/leagues/new" size="ui">
            Starting your own league
          </TextLink>
        </div>
      </Panel>

      <Panel title="Your account">
        <p className="type-body text-ui text-muted-foreground">
          Signed in as <span className="text-foreground">{email}</span>
        </p>
        <TextLink href="/account" size="ui">
          Account settings
        </TextLink>
      </Panel>
    </div>
  );
}
