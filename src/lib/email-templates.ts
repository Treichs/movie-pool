// THE EMAIL TEMPLATE, AND EVERY MESSAGE BUILT ON IT.
//
// Email is a distinct medium and this file treats it as one: a single 600px
// table, every style inline, colours as literal hexes, no custom properties and
// no stylesheet. Nothing here imports from the app's component world — an email
// client is not a browser, and this shell is written for the ones that prove it
// (Outlook's Word engine, Gmail stripping <style>, dark-mode auto-inversion).
//
// ── THE PALETTE IS THE APP'S, COPIED BY HAND AND ON PURPOSE ────────────────
// `globals.css` is the app's theming system, but a `var(--primary)` in an email
// resolves to nothing. So the values below are literal copies of the tokens
// they are named for. THAT IS A FORK, and the only honest way to hold it is to
// say so: if the theme's reds or neutrals ever move, they move here too. The
// token name is in the comment on every line so the pairing is greppable.
//
// The two-red rule survives the copy, because it is the rule that keeps the
// accent legible: BAND_RED (--nav-primary) appears only on the ink masthead,
// RED (--primary) only on paper. Neither is legible on the other's ground.
//
// ── THE MASTHEAD IS THE FILM STRIP ────────────────────────────────────────
// The brand mark is an ink panel with perforations down both edges, geometry
// 26x34 at rx 7. Here it is halved and rendered as table cells: Outlook drops
// border-radius and draws squares, which still reads as sprocket holes. The
// wordmark sits between them. This is the same motif as the auth screens, the
// landing hero and the league mark — an email that arrives looking like a
// different product is a phishing lesson nobody asked for.
//
// ── SUBJECTS SAY THE NEWS ─────────────────────────────────────────────────
// The subject carries the fact, the preheader carries the consequence, and the
// body says it once more before handing over ONE link. A player should be able
// to act from the inbox list without opening anything.
//
// ── EVERYTHING USER-AUTHORED IS ESCAPED ───────────────────────────────────
// Display names, season names, league names and film titles pass through esc().
// A league named "<script>" is a joke someone will eventually make.

export type Email = { subject: string; html: string };

// --- The tokens, copied from globals.css -----------------------------------
const PAGE = "#F5F4F3"; // --background
const PAPER = "#FFFFFF"; // --card
const INK = "#000000"; // --foreground
const MUTED = "#6B6A68"; // --muted-foreground
const BORDER = "#DCDBD9"; // --border
const EDGE = "#84827E"; // --edge
const RED = "#C52F1B"; // --primary — PAPER SIDE ONLY
const RED_TEXT = "#F5F4F3"; // --primary-foreground
const BAND = "#000000"; // --nav
const BAND_TEXT = "#F5F4F3"; // --nav-foreground
const BAND_RED = "#EB4B37"; // --nav-primary — INK SIDE ONLY
const SUCCESS = "#266445"; // --success
const DESTRUCTIVE = "#7A1D10"; // --destructive
// nav-foreground at the 88% the brand's own perforation uses, flattened over
// black — email cannot be trusted with opacity.
const PERF = "#D7D6D5";

const RADIUS = "4px"; // --radius
const PERF_RADIUS = "4px"; // --radius-perf, halved with the mark

// Archivo is the app's face and Apple Mail will honour it; Gmail will not, and
// that is fine — the stack below is what most readers actually see, so it is
// chosen rather than inherited.
const FONT = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One sprocket hole. Two of these stack in each masthead gutter. */
const perf = () =>
  `<tr><td style="line-height:0;font-size:0;padding:3px 0;"><div style="width:13px;height:17px;background-color:${PERF};border-radius:${PERF_RADIUS};">&nbsp;</div></td></tr>`;

const gutter = () =>
  `<td width="37" valign="middle" style="width:37px;padding:0 12px;">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0">${perf()}${perf()}</table>
   </td>`;

/** Footer variants. Automatic mail must say where the switch is; a security
 *  notice must say plainly that there is no switch. */
export type EmailFooter =
  | { kind: "automatic"; seasonName: string; siteUrl: string }
  | { kind: "security" }
  | { kind: "invite" };

function footerHtml(f: EmailFooter): string {
  const base = `margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};`;
  if (f.kind === "automatic") {
    return `<p style="${base}">You are getting this because you play in ${esc(
      f.seasonName
    )} on The Movie Pool.<br>
      Choose what you are emailed at <a href="${f.siteUrl}/account" style="color:${RED};">${f.siteUrl}/account</a>.</p>`;
  }
  if (f.kind === "security") {
    return `<p style="${base}">This is a security notice about your Movie Pool account. These are always sent and cannot be turned off.</p>`;
  }
  return `<p style="${base}">Someone invited you to a league on The Movie Pool. If you were not expecting this, ignore it &mdash; the invitation expires on its own.</p>`;
}

/**
 * THE SHELL — every email in the app is this, with different contents.
 *
 * Preheader, the film-strip masthead, an uppercase eyebrow, the heading, the
 * body, one bulletproof button, the same link again as plain text for the
 * clients that eat buttons, and a footer that says why this arrived.
 *
 * `cta` is optional: a security notice has nothing to press, and offering a
 * button on one trains people to click links in mail about their password.
 */
function shell(opts: {
  preheader: string;
  eyebrow?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  footer: EmailFooter;
}): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
        <tr><td style="background-color:${RED};border-radius:${RADIUS};">
          <a href="${opts.cta.href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.01em;color:${RED_TEXT};text-decoration:none;">${esc(opts.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
        Or open <a href="${opts.cta.href}" style="color:${RED};word-break:break-all;">${opts.cta.href}</a>
      </p>`
    : "";

  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:${MUTED};">${esc(opts.eyebrow)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE};">
<tr><td align="center" style="padding:28px 12px 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

    <!-- The masthead: an ink strip with a perforated gutter each side. -->
    <tr><td style="background-color:${BAND};border-radius:${RADIUS} ${RADIUS} 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${gutter()}
          <td align="center" valign="middle" style="padding:18px 0;">
            <span style="font-family:${FONT};font-size:15px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${BAND_TEXT};">The Movie<span style="color:${BAND_RED};">&nbsp;Pool</span></span>
          </td>
          ${gutter()}
        </tr>
      </table>
    </td></tr>

    <!-- The card. -->
    <tr><td style="background-color:${PAPER};border:1px solid ${BORDER};border-top:0;border-radius:0 0 ${RADIUS} ${RADIUS};padding:32px;">
      ${eyebrow}
      <h1 style="margin:0 0 16px;font-family:${FONT};font-size:28px;font-weight:800;line-height:1.12;letter-spacing:-0.02em;color:${INK};">${opts.heading}</h1>
      <div style="font-family:${FONT};font-size:15px;line-height:1.65;color:${INK};">
${opts.bodyHtml}
      </div>
      ${cta}
    </td></tr>

    <tr><td style="padding:18px 4px 0;">
      ${footerHtml(opts.footer)}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const p = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;

/** A bordered aside — the deadline, the amount, the thing that is not prose. */
const callout = (html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
    <tr><td style="border-left:3px solid ${EDGE};padding:2px 0 2px 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${html}</td></tr>
  </table>`;

const auto = (seasonName: string, siteUrl: string): EmailFooter => ({
  kind: "automatic",
  seasonName,
  siteUrl,
});

// ===========================================================================
// AUTOMATIC — the two the cron sweep sends, both gated by profiles.notify_*
// ===========================================================================

/** 1. THE REVEAL — bidding closed and the sealed sheet is open. */
export function revealEmail(opts: {
  name: string;
  seasonName: string;
  weekNumber: number;
  link: string;
  siteUrl: string;
}): Email {
  return {
    subject: `The week ${opts.weekNumber} bids are open — ${opts.seasonName}`,
    html: shell({
      preheader: `Every sealed bid is on the table. See who owns the weekend.`,
      eyebrow: `${opts.seasonName} · Week ${String(opts.weekNumber).padStart(2, "0")}`,
      heading: `The sealed sheet is open`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `Bidding on <strong>week ${opts.weekNumber}</strong> of <strong>${esc(opts.seasonName)}</strong> has closed, and every sealed bid is now on the table &mdash; who bid what, who owns each film, and who missed by a dollar.`
        ) +
        p(`The films open this weekend. The scores land Monday.`),
      cta: { label: "See the reveal", href: opts.link },
      footer: auto(opts.seasonName, opts.siteUrl),
    }),
  };
}

/** 2. MONDAY SCORES — the week is final and the points are real. */
export function mondayScoresEmail(opts: {
  name: string;
  seasonName: string;
  weekNumber: number;
  link: string;
  siteUrl: string;
}): Email {
  return {
    subject: `${opts.seasonName} week ${opts.weekNumber} is scored`,
    html: shell({
      preheader: `The box office is in and every owner has their points.`,
      eyebrow: `${opts.seasonName} · Week ${String(opts.weekNumber).padStart(2, "0")}`,
      heading: `Week ${opts.weekNumber} is scored`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `The weekend numbers are in for <strong>week ${opts.weekNumber}</strong> of <strong>${esc(opts.seasonName)}</strong> &mdash; box office times Tomatometer, and every owner has been paid their films&#39; points.`
        ) +
        p(`The leaderboard has moved. Go see which way.`),
      cta: { label: "See the standings", href: opts.link },
      footer: auto(opts.seasonName, opts.siteUrl),
    }),
  };
}

// ===========================================================================
// THE PAYOUTS STATEMENT — the letter the commissioner used to write by hand
// ===========================================================================

export type PayoutStatementRow = {
  name: string;
  place: number;
  points: number;
  won: number;
  owing: number;
  net: number;
};

const money = (n: number) =>
  `<span style="color:${n > 0 ? SUCCESS : n < 0 ? DESTRUCTIVE : MUTED};font-weight:700;">${n < 0 ? `−$${-n}` : `$${n}`}</span>`;

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
  siteUrl: string;
}): Email {
  const th = (label: string, align: "left" | "right") =>
    `<th align="${align}" style="padding:7px 8px;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${BORDER};">${label}</th>`;
  const td = (html: string, align: "left" | "right") =>
    `<td align="${align}" style="padding:8px;font-family:${FONT};font-size:14px;color:${INK};border-bottom:1px solid ${BORDER};">${html}</td>`;

  const ledger = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px;border-collapse:collapse;">
<tr>${th("Player", "left")}${th("Place", "left")}${th("Points", "right")}${th("Won", "right")}${th("Owing", "right")}${th("Net", "right")}</tr>
${opts.rows
  .map(
    (r) =>
      `<tr>${td(esc(r.name), "left")}${td(ordinalWord(r.place), "left")}${td(r.points.toFixed(2), "right")}${td(`$${r.won}`, "right")}${td(`$${r.owing}`, "right")}${td(money(r.net), "right")}</tr>`
  )
  .join("\n")}
</table>`;

  const yours = opts.mine
    ? callout(
        `You finished <strong>${ordinalWord(opts.mine.place)} of ${opts.mine.total}</strong> with <strong>${opts.mine.points.toFixed(2)}</strong> points. ` +
          (opts.mine.net > 0
            ? `The commissioner owes you ${money(opts.mine.net)}.`
            : opts.mine.net < 0
              ? `You owe the commissioner ${money(opts.mine.net)}.`
              : `You are level &mdash; nothing changes hands.`)
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
      eyebrow: `${opts.seasonName} · Final`,
      heading: `The season is settled`,
      bodyHtml:
        p(`Hi ${esc(opts.name)},`) +
        p(
          `<strong>${esc(opts.seasonName)}</strong> is complete and the payouts are final.`
        ) +
        yours +
        `<p style="margin:22px 0 4px;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">The ledger</p>` +
        ledger +
        `<p style="margin:0;font-size:13px;color:${MUTED};">Everyone pays the commissioner their &ldquo;Owing&rdquo;; the commissioner pays out &ldquo;Won&rdquo;.</p>`,
      cta: { label: "See your season wrap", href: opts.link },
      footer: auto(opts.seasonName, opts.siteUrl),
    }),
  };
}

// ===========================================================================
// THE INVITATION — one person, one commissioner's act
// ===========================================================================

/**
 * The recipient may have NO ACCOUNT YET, which is why this is transactional and
 * carries no preference: there is no `profiles` row to consult, and an invited
 * player who is never told has been invited to nothing. The token in the link
 * IS the credential — `/invites/[token]` is what turns it into a membership.
 */
export function leagueInviteEmail(opts: {
  leagueName: string;
  /** The commissioner's display name — who is asking. */
  invitedBy: string;
  link: string;
  /** Preformatted expiry, e.g. "Saturday, 13 September". Null if none is set. */
  expires: string | null;
}): Email {
  return {
    subject: `${opts.invitedBy} invited you to ${opts.leagueName}`,
    html: shell({
      preheader: `A season-long game about opening weekends. Your invitation is inside.`,
      eyebrow: "You have been invited",
      heading: `Join ${esc(opts.leagueName)}`,
      bodyHtml:
        p(
          `<strong>${esc(opts.invitedBy)}</strong> has invited you to play in <strong>${esc(opts.leagueName)}</strong> on The Movie Pool.`
        ) +
        p(
          `It is a season-long game about opening weekends: you get $100 of fake money and twenty-odd Fridays, you bid blind on the films opening each week, and what you own scores its opening box office times its Tomatometer.`
        ) +
        (opts.expires
          ? callout(`This invitation expires on <strong>${esc(opts.expires)}</strong>.`)
          : ""),
      cta: { label: "Accept the invitation", href: opts.link },
      footer: { kind: "invite" },
    }),
  };
}

// ===========================================================================
// SECURITY NOTICES — always sent, never a preference, and never a button
// ===========================================================================

/**
 * These three lived as inline HTML strings inside the action files, which meant
 * the app had two email designs: this shell, and three hand-written `<p>` tags.
 * They are here now for one reason — a person who gets a password notice that
 * looks nothing like the rest of the app's mail has been taught, by us, that a
 * Movie Pool email can look like anything.
 *
 * NO CALL TO ACTION, deliberately. Every one of these is "if this was not you,
 * go and change your password" — and a button in that mail is a phishing
 * rehearsal. The address is given as plain text for the reader to type.
 */
function securityNotice(opts: {
  subject: string;
  heading: string;
  bodyHtml: string;
  preheader: string;
}): Email {
  return {
    subject: opts.subject,
    html: shell({
      preheader: opts.preheader,
      eyebrow: "Security notice",
      heading: opts.heading,
      bodyHtml: opts.bodyHtml,
      footer: { kind: "security" },
    }),
  };
}

export function passwordChangedEmail(siteUrl: string): Email {
  return securityNotice({
    subject: "Your Movie Pool password was changed",
    preheader: "Every other signed-in device was signed out.",
    heading: "Your password was changed",
    bodyHtml:
      p(
        `Your Movie Pool password was just changed, and every other signed-in device was signed out.`
      ) +
      p(`<strong>If this was you, there is nothing to do.</strong>`) +
      callout(
        `If it was not, reset it straight away at <strong>${siteUrl}/forgot-password</strong>.`
      ),
  });
}

export function passwordResetEmail(siteUrl: string): Email {
  return securityNotice({
    subject: "Your Movie Pool password was reset",
    preheader: "Every other signed-in device was signed out.",
    heading: "Your password was reset",
    bodyHtml:
      p(
        `Your Movie Pool password was just reset using a link sent to this address, and every other signed-in device was signed out.`
      ) +
      p(`<strong>If this was you, there is nothing to do.</strong>`) +
      callout(
        `If it was not, reset it again straight away at <strong>${siteUrl}/forgot-password</strong>.`
      ),
  });
}

export function emailChangeRequestedEmail(opts: {
  newEmail: string;
  siteUrl: string;
}): Email {
  return securityNotice({
    subject: "Your Movie Pool sign-in email is being changed",
    preheader: "It is not changed yet. This address still signs you in.",
    heading: "Your sign-in email is being changed",
    bodyHtml:
      p(
        `Someone asked to change the sign-in address on your Movie Pool account to <strong>${esc(opts.newEmail)}</strong>.`
      ) +
      p(
        `It is not changed yet &mdash; it takes effect only when the link sent to the new address is opened. Until then this address still signs you in.`
      ) +
      callout(
        `<strong>If this was not you</strong>, change your password now at <strong>${opts.siteUrl}/forgot-password</strong>.`
      ),
  });
}
