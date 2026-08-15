"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@bunnydex/ui";

const HERO_CARDS = ["meadow-hop", "cinder-monarch", "tide-tuft", "eclipse-empress"];

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-meadow-700/50 bg-gradient-to-br from-meadow-900 via-meadow-950 to-black px-6 py-16 md:px-12 md:py-24">
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,rgba(111,207,151,0.35)_1px,transparent_0)] [background-size:24px_24px]" />
      <div className="relative grid items-center gap-10 md:grid-cols-[1fr_minmax(0,22rem)]">
      <div className="max-w-2xl">
        <p className="font-display text-5xl leading-none text-meadow-400 md:text-7xl">
          BunnyDex
        </p>
        <h1 className="mt-4 font-display text-2xl text-meadow-100 md:text-3xl">
          Discover. Collect. Battle.
        </h1>
        <p className="mt-4 max-w-lg text-meadow-100/70">
          A Discord-first collectible card game. Hunt rare bunnies, build decks, and
          clash in three-lane battles — then manage your collection on the web.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {session ? (
            <>
              <a href="/profile">
                <Button>Open profile</Button>
              </a>
              <a href="/wiki">
                <Button className="bg-transparent border border-meadow-400 text-meadow-400">
                  Open wiki
                </Button>
              </a>
              <Button
                className="bg-transparent border border-meadow-400 text-meadow-400"
                onClick={() => signOut()}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => signIn("discord")}>Continue with Discord</Button>
              <a href="/wiki">
                <Button className="bg-transparent border border-meadow-400 text-meadow-400">
                  Read the wiki
                </Button>
              </a>
            </>
          )}
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-3">
        {HERO_CARDS.map((slug) => (
          <a
            key={slug}
            href={`/cards/${slug}`}
            className="overflow-hidden rounded-2xl border border-meadow-700/70 shadow-lg shadow-black/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/cards/${slug}.png`} alt="" className="aspect-square w-full object-cover" />
          </a>
        ))}
      </div>
      </div>
    </section>
  );
}
