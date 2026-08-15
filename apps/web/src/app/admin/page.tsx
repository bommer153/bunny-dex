"use client";

import { useEffect, useState } from "react";
import { Button } from "@bunnydex/ui";

export default function AdminPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState("500");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("1000");

  async function load() {
    const r = await fetch("/api/admin");
    const d = await r.json();
    if (!r.ok) setError(d.error);
    else setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveFee() {
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "config",
        values: { marketplaceFeeBps: Number(fee) },
      }),
    });
    await load();
  }

  async function grant() {
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "give_currency",
        targetDiscordId: target,
        currency: "coins",
        amount: Number(amount),
      }),
    });
    await load();
  }

  if (error) return <p className="text-red-300">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const config = data.config as Record<string, number>;
  const audit = (data.audit as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-meadow-400">Admin</h1>
      <section className="space-y-2 rounded-xl border border-meadow-700 bg-meadow-900 p-4">
        <h2 className="font-display text-xl">Economy config</h2>
        <p className="text-sm text-meadow-100/60">
          Current marketplace fee: {config.marketplaceFeeBps} bps
        </p>
        <div className="flex gap-2">
          <input
            className="rounded-md border border-meadow-700 bg-meadow-950 px-3 py-2"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <Button onClick={saveFee}>Update fee bps</Button>
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-meadow-700 bg-meadow-900 p-4">
        <h2 className="font-display text-xl">Grant coins</h2>
        <input
          className="mr-2 rounded-md border border-meadow-700 bg-meadow-950 px-3 py-2"
          placeholder="Target Discord ID"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <input
          className="mr-2 rounded-md border border-meadow-700 bg-meadow-950 px-3 py-2"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button onClick={grant}>Grant</Button>
      </section>
      <section>
        <h2 className="mb-2 font-display text-xl">Audit log</h2>
        <ul className="space-y-1 text-sm">
          {audit.map((a) => (
            <li key={String(a._id)}>
              {String(a.action)} by {String(a.actorDiscordId)}
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-meadow-100/60">
        Cards in catalog: {((data.cards as unknown[]) ?? []).length}
      </p>
    </div>
  );
}
