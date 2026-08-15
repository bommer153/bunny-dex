"use client";

import { useEffect, useState } from "react";

export default function BattlesPage() {
  const [battles, setBattles] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/battles")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setBattles(d.battles ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Battle History</h1>
      <ul className="space-y-2">
        {battles.map((b) => (
          <li key={String(b._id)} className="rounded-xl border border-meadow-700 bg-meadow-900 p-4 text-sm">
            {String(b.mode)} · status {String(b.status)} · winner{" "}
            {String(b.winnerId ?? "draw")}
          </li>
        ))}
      </ul>
    </div>
  );
}
