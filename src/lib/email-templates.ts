// THE FIVE DESIGNED EMAILS (settlement project, 2026-08-16).
//
// Email is a distinct medium and this file treats it as one: no web fonts, a
// single 600px table, every style inline, colors as literal hexes. Nothing
// here imports from the app's component world — an email client is not a
// browser, and the shell below is written for the clients that prove it
// (Outlook's Word engine, Gmail's style stripping, dark-mode inversion).
//
// The palette is the app's, translated for paper: the ink band up top is the
// app's background (#080C13) carrying the cream wordmark (#F2E9DC), the
// button is the lavender primary (#B98CFF) with ink text, and money keeps its
// directions — collect green, owe red — darkened enough to hold contrast on
// white. The body reads light deliberately: dark emails are what clients
// mangle first.
//
// Subjects say the news; bodies say it again in one line and hand over ONE
// link. A player should be able to act from the inbox list alone.
//
// EVERYTHING USER-AUTHORED IS ESCAPED. Display names, season names and film
// titles pass through esc() — a league named "<script>" is a joke someone
// will eventually make.

export type Email = { subject: string; html: string };

const INK = "#1C1626";
const PAPER = "#FFFFFF";
const BAND = "#080C13";
const CREAM = "#F2E9DC";
const LAVENDER = "#B98CFF";
const VIOLET = "#7B4FE0";
const MUTED = "#6E6678";
const BORDER = "#E8E2D9";
const GREEN = "#2E8B62";
const RED = "#C2434F";

const FONT =
  "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The shared shell. A preheader (the inbox-list second line), the ink band
 * with the wordmark, a serif heading, the body, one bulletproof button, and
 * a footer that names the league context so a member of several leagues
 * knows which world is talking.
 */
function shell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta: { label: string; href: string };
  footer: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F1EB;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F1EB;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
    <tr><td style="background-color:${BAND};border-radius:12px 12px 0 0;padding:18px 32px;">
      <span style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${CREAM};">The Movie Pool</span>
    </td></tr>
    <tr><td style="background-color:${PAPER};border:1px solid ${BORDER};border-top:0;border-radius:0 0 12px 12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:1.25;color:${INK};">${opts.heading}</h1>
      <div style="font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">
${opts.bodyHtml}
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
        <tr><td style="background-color:${LAVENDER};border-radius:8px;">
          <a href="${opts.cta.href}" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:15px;font-weight:bold;color:${BAND};text-decoration:none;">${esc(opts.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:12px;color:${MUTED};">
        Or open <a href="${opts.cta.href}" style="color:${VIOLET};">${opts.cta.href}</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">${opts.footer}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const p = (html: string) =>
  `<p style="margin:0 0 14px;">${html}</p>`;

const footerFor = (seasonName: string) =>
  `You are getting this because you play in ${esc(seasonName)} on The Movie Pool.`;

// ---------------------------------------------------------------------------
// 1. THE SLATE IS UP — the week opened and bidding started.
// ---------------------------------------------------------------------------
export function slateUpEmail(opts: {
  name: string;
  seasonName: string;
  weekNumber: number;
  filmTitles: string[];
  /** Preformatted deadline sentence fragment, e.g. "Thursday, July 16 at 7:00 PM (ET)". Null when no deadline is set. */
  deadline: string | null;
  link: string;
}): Email {
  const shown = opts.filmTitles.slice(0, 8);
  const more = opts.filmTitles.length - shown.length;
  const films =
    shown.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">${shown
          .map(
            (t) =>
              `<tr><td style="font-family:${FONT};font-size:15px;line-height:1.9;color:${INK};">&bull;&nbsp; ${esc(t)}</td></tr>`
          )
          .join("")}${
          more > 0
            ? `<tr><td style="font-family:${FONT};font-size:13px;color:${MUTED};">&hellip;and ${more} more</td></tr>`
            : ""
        }</table>`
      : "";
  return {
    subject: `The week ${opts.weekNumber} slate is up — ${opts.seasonName}`,
    html: shell({
      preheader: `${opts.filmTitles.length} film${opts.filmTitles.length === 1 ? "" : "s"} opening. Sealed bids are open now.`,
      heading: `Week ${opts.weekNumber} is open`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `The commissioner has posted the week ${opts.weekNumber} slate for <strong>${esc(opts.seasonName)}</strong> and sealed bidding is open:`
        ) +
        films +
        (opts.deadline
          ? p(`Bids are due <strong>${esc(opts.deadline)}</strong>.`)
          : ""),
      cta: { label: "See the slate & bid", href: opts.link },
      footer: footerFor(opts.seasonName),
    }),
  };
}

// ---------------------------------------------------------------------------
// 2. DEADLINE NEAR — you haven't bid and the clock is real.
// ---------------------------------------------------------------------------
export function deadlineNearEmail(opts: {
  name: string;
  seasonName: string;
  weekNumber: number;
  deadline: string;
  link: string;
}): Email {
  return {
    subject: `Bids due for ${opts.seasonName} week ${opts.weekNumber}`,
    html: shell({
      preheader: `Your sealed bids are due ${opts.deadline}.`,
      heading: `Your bids aren't in yet`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `You haven't bid on <strong>week ${opts.weekNumber}</strong> of <strong>${esc(opts.seasonName)}</strong>. Bids are due <strong>${esc(opts.deadline)}</strong> — after that the sheet is sealed and the week runs without you.`
        ) +
        p(
          `A single $1 bid keeps you in the weekend. Silence doesn't.`
        ),
      cta: { label: "Place your sealed bids", href: opts.link },
      footer: footerFor(opts.seasonName),
    }),
  };
}

// ---------------------------------------------------------------------------
// 3. THE REVEAL — bidding closed, the sealed sheet is open.
// ---------------------------------------------------------------------------
export function revealEmail(opts: {
  name: string;
  seasonName: string;
  weekNumber: number;
  link: string;
}): Email {
  return {
    subject: `The week ${opts.weekNumber} bids are open — ${opts.seasonName}`,
    html: shell({
      preheader: `Every sealed bid is on the table. See who owns the weekend.`,
      heading: `The sealed sheet is open`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `Bidding on <strong>week ${opts.weekNumber}</strong> of <strong>${esc(opts.seasonName)}</strong> has closed, and every sealed bid is now on the table — who bid what, who owns each film, and who missed by a dollar.`
        ) +
        p(`The films open this weekend. The scores land Monday.`),
      cta: { label: "See the reveal", href: opts.link },
      footer: footerFor(opts.seasonName),
    }),
  };
}

// ---------------------------------------------------------------------------
// 4. MONDAY SCORES — the week is final and the points are real.
// ---------------------------------------------------------------------------
export function mondayScoresEmail(opts: {
  name: string;
  seasonName: string;
  weekNumber: number;
  link: string;
}): Email {
  return {
    subject: `${opts.seasonName} week ${opts.weekNumber} is scored`,
    html: shell({
      preheader: `The box office is in and every owner has their points.`,
      heading: `Week ${opts.weekNumber} is scored`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `The weekend numbers are in for <strong>week ${opts.weekNumber}</strong> of <strong>${esc(opts.seasonName)}</strong> — box office times Tomatometer, and every owner has been paid their films&#39; points.`
        ) +
        p(`The leaderboard has moved. Go see which way.`),
      cta: { label: "See the standings", href: opts.link },
      footer: footerFor(opts.seasonName),
    }),
  };
}

// ---------------------------------------------------------------------------
// 5. THE PAYOUTS STATEMENT — the season is settled; this is the letter the
// commissioner used to write by hand.
// ---------------------------------------------------------------------------
export type PayoutStatementRow = {
  name: string;
  place: number;
  points: number;
  won: number;
  owing: number;
  net: number;
};

const money = (n: number) =>
  `<span style="color:${n > 0 ? GREEN : n < 0 ? RED : MUTED};font-weight:bold;">${n < 0 ? `-$${-n}` : `$${n}`}</span>`;

const ordinalWord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export function payoutsFinalEmail(opts: {
  name: string;
  seasonName: string;
  /** The recipient's own line — null for a member with no ledger line. */
  mine: { place: number; total: number; points: number; net: number } | null;
  rows: PayoutStatementRow[];
  link: string;
}): Email {
  const th = (label: string, align: "left" | "right") =>
    `<th align="${align}" style="padding:6px 8px;font-family:${FONT};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${BORDER};">${label}</th>`;
  const td = (html: string, align: "left" | "right") =>
    `<td align="${align}" style="padding:7px 8px;font-family:${FONT};font-size:14px;color:${INK};border-bottom:1px solid ${BORDER};">${html}</td>`;

  const ledger = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;border-collapse:collapse;">
<tr>${th("Player", "left")}${th("Place", "left")}${th("Points", "right")}${th("Won", "right")}${th("Owing", "right")}${th("Net", "right")}</tr>
${opts.rows
  .map(
    (r) =>
      `<tr>${td(esc(r.name), "left")}${td(ordinalWord(r.place), "left")}${td(r.points.toFixed(2), "right")}${td(`$${r.won}`, "right")}${td(`$${r.owing}`, "right")}${td(money(r.net), "right")}</tr>`
  )
  .join("\n")}
</table>`;

  const yours = opts.mine
    ? p(
        `You finished <strong>${ordinalWord(opts.mine.place)} of ${opts.mine.total}</strong> with <strong>${opts.mine.points.toFixed(2)}</strong> points. ` +
          (opts.mine.net > 0
            ? `The commissioner owes you ${money(opts.mine.net)}.`
            : opts.mine.net < 0
              ? `You owe the commissioner ${money(opts.mine.net)}.`
              : `You are level — nothing changes hands.`)
      )
    : p(`The final ledger for the season is below.`);

  return {
    subject: opts.mine
      ? `${opts.seasonName} is settled — you finished ${ordinalWord(opts.mine.place)}`
      : `${opts.seasonName} is settled`,
    html: shell({
      preheader: opts.mine
        ? opts.mine.net > 0
          ? `You collect $${opts.mine.net}. The full ledger is inside.`
          : opts.mine.net < 0
            ? `You owe $${-opts.mine.net}. The full ledger is inside.`
            : `You are level. The full ledger is inside.`
        : `The final ledger is inside.`,
      heading: `The season is settled`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `<strong>${esc(opts.seasonName)}</strong> is complete and the payouts are final.`
        ) +
        yours +
        `<p style="margin:20px 0 4px;font-family:${FONT};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">The ledger</p>` +
        ledger +
        p(
          `<span style="font-size:13px;color:${MUTED};">Everyone pays the commissioner their &ldquo;Owing&rdquo;; the commissioner pays out &ldquo;Won&rdquo;.</span>`
        ),
      cta: { label: "See your season wrap", href: opts.link },
      footer: footerFor(opts.seasonName),
    }),
  };
}
