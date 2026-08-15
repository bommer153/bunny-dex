"use client";

import { useEffect, useState } from "react";
import { Button } from "@bunnydex/ui";

export default function MarketplacePage() {
  const [listings, setListings] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const url = q
      ? `/api/marketplace?q=${encodeURIComponent(q)}`
      : "/api/marketplace";
    const r = await fetch(url);
    const d = await r.json();
    setListings(d.listings ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function buy(listingId: string) {
    const r = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buy", listingId }),
    });
    const d = await r.json();
    setMsg(r.ok ? `Bought! Fee ${d.fee}` : d.error);
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Marketplace</h1>
      {msg && <p>{msg}</p>}
      <div className="flex gap-2">
        <input
          className="rounded-md border border-meadow-700 bg-meadow-900 px-3 py-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
        />
        <Button onClick={load}>Search</Button>
      </div>
      <ul className="space-y-2">
        {listings.map((l) => (
          <li
            key={String(l._id)}
            className="flex items-center justify-between rounded-xl border border-meadow-700 bg-meadow-900 px-4 py-3"
          >
            <span>
              {String(l.name)} ({String(l.rarity)}/{String(l.variant)}) — 🪙
              {String(l.priceCoins)}
            </span>
            <Button onClick={() => buy(String(l._id))}>Buy</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
