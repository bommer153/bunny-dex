import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "BunnyDex",
  description: "Discover. Collect. Battle.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-meadow-950 font-body text-meadow-100 antialiased">
        <Providers>
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(111,207,151,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(46,90,60,0.35),_transparent_50%)]" />
          <header className="border-b border-meadow-700/60 bg-meadow-900/70 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
              <a href="/" className="font-display text-2xl tracking-tight text-meadow-400">
                BunnyDex
              </a>
              <nav className="flex flex-wrap gap-3 text-sm text-meadow-100/80">
                <a href="/wiki">Wiki</a>
                <a href="/profile">Profile</a>
                <a href="/collection">Collection</a>
                <a href="/cards">Cards</a>
                <a href="/deck">Deck</a>
                <a href="/inventory">Inventory</a>
                <a href="/marketplace">Market</a>
                <a href="/battles">Battles</a>
                <a href="/leaderboards">Leaders</a>
                <a href="/achievements">Achievements</a>
                <a href="/admin">Admin</a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
