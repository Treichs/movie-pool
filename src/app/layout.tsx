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
