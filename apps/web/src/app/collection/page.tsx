"use client";

import { useEffect, useState } from "react";

type Progress = {
  completionPct: number;
  unique: number;
  catalogSize: number;
  sets: Array<{ name: string; owned: number; total: number }>;
  rarityProgress: Record<string, { owned: number; total: number }>;
};

export default function CollectionPage() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collection")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed");
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-meadow-400">Collection</h1>
      <p>
        {data.completionPct}% complete — {data.unique}/{data.catalogSize} unique
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {data.sets.map((s) => (
          <div key={s.name} className="rounded-xl border border-meadow-700 bg-meadow-900 p-4">
            <div className="font-medium">{s.name}</div>
            <div className="text-meadow-400">
              {s.owned} / {s.total}
            </div>
          </div>
        ))}
      </div>
      <div>
        <h2 className="mb-2 font-display text-xl">By rarity</h2>
        <ul className="space-y-1 text-sm">
          {Object.entries(data.rarityProgress).map(([r, v]) => (
            <li key={r}>
              {r}: {v.owned}/{v.total}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
