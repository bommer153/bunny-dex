"use client";

import { useEffect, useState } from "react";

export default function InventoryPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inventory")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setItems(d.items ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Inventory</h1>
      <ul className="space-y-2">
        {items.map((i) => {
          const def = i.itemDefinitionId as { name?: string; description?: string };
          return (
            <li key={String(i._id)} className="rounded-xl border border-meadow-700 bg-meadow-900 p-4">
              <div className="font-medium">
                {def?.name} ×{String(i.quantity)}
              </div>
              <div className="text-sm text-meadow-100/60">{def?.description}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
