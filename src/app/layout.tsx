import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// ONE FAMILY, THREE ROLES. Archivo is variable on both `wdth` (62-125) and
// `wght` (100-900), and the design system makes WIDTH the hierarchy rather
// than size. Three calls to the same family bind three CSS variables; Next
// serves one font file.
//
// `axes: ["wdth"]` IS LOAD-BEARING. next/font ships the weight axis only
// unless the others are named. Omit it and you get a fixed-width Archivo,
// every width distinction collapses, and nothing fails.
const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo-sans" });
const heading = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo-heading" });
const numeric = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo-numeric" });

export const metadata: Metadata = {
  title: "The Movie Pool",
  description:
    "Season-long blind-bidding game on opening-weekend films — box office × Tomatometer.",
  // THE MARK, IN THE FOUR SHAPES A CLIENT CAN ASK FOR. Both drawings are the
  // same identity the app's own chrome paints: ink #000000 ground, paper
  // #F5F4F3 letters, vermilion #EB4B37 name — `--nav`, `--nav-foreground` and
  // `--nav-primary`. They are files, not CSS: retune those tokens and the
  // icons have to be recut, they will not follow.
  //
  // src/app/favicon.ico WAS THE NEXT.JS SCAFFOLD DEFAULT, and is now deleted.
  // `app/favicon.ico` is a Next FILE CONVENTION, so Next emits its own
  // <link rel="icon"> for it BEFORE anything declared here — the scaffold
  // triangle would have outranked every entry below. There is one source now.
  //
  // SVG IS FIRST because it is the only one that stays crisp at any tab size.
  // The PNGs are the fallback for clients that do not take it, plus the one
  // case where a PNG is mandatory: iOS ignores SVG for apple-touch-icon and
  // composites a transparent one onto black, so that entry is the tile drawing
  // already flattened onto the app's own ink.
  //
  // Every raster here is generated from the two SVGs by `npm run icons`, so a
  // size cannot drift from the drawing it came from.
  icons: {
    icon: [
      { url: "/movie-pool-favicon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning is required if you ever switch dark on: the
    // class written to <html> can legitimately differ between the server
    // render and the client's resolved theme on first paint.
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", sans.variable, heading.variable, numeric.variable)}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
