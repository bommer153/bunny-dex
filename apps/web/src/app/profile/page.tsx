"use client";

import { useEffect, useState } from "react";
import { Stat } from "@bunnydex/ui";

export default function ProfilePage() {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed");
        setUser(data.user);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;
  if (!user) return <p className="text-meadow-100/60">Loading…</p>;

  const stats = (user.stats ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-meadow-400">{String(user.displayName)}</h1>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Level" value={String(user.level)} />
        <Stat label="Coins" value={String(user.coins)} />
        <Stat label="Gems" value={String(user.gems)} />
        <Stat label="Rating" value={String(user.battleRating)} />
        <Stat label="Wins" value={stats.wins ?? 0} />
        <Stat label="Losses" value={stats.losses ?? 0} />
        <Stat label="Cards" value={stats.cardsOwned ?? 0} />
        <Stat label="Unique" value={stats.collectionUnique ?? 0} />
      </div>
    </div>
  );
}
