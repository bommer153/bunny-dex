"use client";

import { useEffect, useState } from "react";

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/achievements")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setAchievements(d.achievements ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Achievements</h1>
      <ul className="space-y-2">
        {achievements.map((a) => (
          <li key={String(a.slug)} className="rounded-xl border border-meadow-700 bg-meadow-900 p-4">
            {a.unlocked ? "✅" : "⬜"} <strong>{String(a.name)}</strong> —{" "}
            {String(a.description)}
          </li>
        ))}
      </ul>
    </div>
  );
}
