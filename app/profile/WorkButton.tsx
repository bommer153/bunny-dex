"use client";
// Work: quick and repeatable. Spinner while pending, then a carrot/coin pop and the confirmed earnings counting up.
import { useState } from "react";
import { workPlay } from "../actions";
import { Burst, CountUp } from "../fx/Burst";
import { useConfirmed, useLock } from "../fx/useConfirmed";

export default function WorkButton({ energy, cost, className }: { energy: number; cost: number; className: string }) {
  const work = useConfirmed(workPlay);
  const lock = useLock();
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<{ id: number; coins: number; leveledUp: boolean; level: number } | null>(null);
  const [error, setError] = useState("");

  async function go() {
    setPending(true);
    setError("");
    const r = await work();
    setPending(false);
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setLast({ id: Date.now(), coins: r.data.coins, leveledUp: r.data.leveledUp, level: r.data.level });
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button onClick={() => lock(go)} disabled={pending || energy < cost} className={className} aria-busy={pending}>
        {pending ? <><span className="spinner" aria-hidden /> Working…</> : <>💼 Work · ⚡{cost}</>}
      </button>
      <span aria-live="polite" className="text-sm">
        {last && (
          <span key={last.id} className="relative inline-block font-semibold text-amber-300 anim-pop">
            +<CountUp value={last.coins} from={0} ms={600} /> 🪙{last.leveledUp && ` · 🎉 level ${last.level}!`}
            <Burst items={["🪙", "🥕"]} count={10} spread={55} salt={last.id % 97} />
          </span>
        )}
        {error && <span role="alert" className="text-red-300 anim-shake inline-block">{error}</span>}
      </span>
    </div>
  );
}
