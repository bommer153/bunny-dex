"use client";

import { useEffect, useState } from "react";

export default function CardsPage() {
  const [cards, setCards] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const url = q ? `/api/cards?q=${encodeURIComponent(q)}` : "/api/cards";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setCards(d.cards ?? []));
  }, [q]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Card Catalog</h1>
      <input
        className="w-full max-w-md rounded-md border border-meadow-700 bg-meadow-900 px-3 py-2"
        placeholder="Search cards…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <a
            key={String(c._id)}
            href={`/cards/${c.slug}`}
            className="rounded-xl border border-meadow-700 bg-meadow-900 p-4 transition hover:border-meadow-400"
          >
            <div className="font-display text-lg">{String(c.name)}</div>
            <div className="text-sm text-meadow-100/60">
              {String(c.rarity)} · {String(c.element)}
            </div>
            <div className="mt-2 text-sm">
              ATK {String(c.atk)} · DEF {String(c.def)} · HP {String(c.hp)}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
