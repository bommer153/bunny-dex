"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@bunnydex/ui";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-meadow-700/50 bg-gradient-to-br from-meadow-900 via-meadow-950 to-black px-6 py-16 md:px-12 md:py-24">
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,rgba(111,207,151,0.35)_1px,transparent_0)] [background-size:24px_24px]" />
      <div className="relative max-w-2xl">
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
              <Button
                className="bg-transparent border border-meadow-400 text-meadow-400"
                onClick={() => signOut()}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button onClick={() => signIn("discord")}>Continue with Discord</Button>
          )}
        </div>
      </div>
    </section>
  );
}
