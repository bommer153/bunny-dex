"use client";

import { useEffect, useState } from "react";
import { Button } from "@bunnydex/ui";

export default function DeckPage() {
  const [decks, setDecks] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/decks");
    const d = await r.json();
    if (!r.ok) setError(d.error);
    else setDecks(d.decks ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
    });
    setName("");
    await load();
  }

  async function activate(deckName: string) {
    const r = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "use", name: deckName }),
    });
    const d = await r.json();
    if (!r.ok) setError(d.error);
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-meadow-400">Deck Builder</h1>
      {error && <p className="text-red-300">{error}</p>}
      <div className="flex gap-2">
        <input
          className="rounded-md border border-meadow-700 bg-meadow-900 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Deck name"
        />
        <Button onClick={create}>Create</Button>
      </div>
      <ul className="space-y-2">
        {decks.map((d) => (
          <li
            key={String(d._id)}
            className="flex items-center justify-between rounded-xl border border-meadow-700 bg-meadow-900 px-4 py-3"
          >
            <span>
              {d.isActive ? "✅ " : ""}
              <strong>{String(d.name)}</strong> —{" "}
              {(d.slots as unknown[])?.length ?? 0} cards
            </span>
            <Button onClick={() => activate(String(d.name))}>Set active</Button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-meadow-100/60">
        Add cards via Discord: `bd deck add &lt;name&gt; &lt;userCardId&gt;`
      </p>
    </div>
  );
}
