"use client";

import { useEffect, useState } from "react";

export default function LeaderboardsPage() {
  const [kind, setKind] = useState("wealth");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch(`/api/leaderboards?kind=${kind}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []));
  }, [kind]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Leaderboards</h1>
      <select
        className="rounded-md border border-meadow-700 bg-meadow-900 px-3 py-2"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        {["wealth", "collection", "rating", "wins", "achievements"].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <ol className="space-y-2">
        {rows.map((r) => (
          <li
            key={String(r.rank)}
            className="rounded-xl border border-meadow-700 bg-meadow-900 px-4 py-3"
          >
            #{String(r.rank)} {String(r.displayName)} — 🪙{String(r.coins)} · ★
            {String(r.battleRating)}
          </li>
        ))}
      </ol>
    </div>
  );
}
