"use client";
// Burrow collect: a digging tunnel pulses while the server collects, then the confirmed coins burst out and count up.
import { useState } from "react";
import { burrowCollectPlay } from "../actions";
import { Burst, CountUp } from "../fx/Burst";
import { reducedMotion } from "../fx/stage";
import { useConfirmed, useLock } from "../fx/useConfirmed";

export default function CollectButton({ ready, className }: { ready: number; className: string }) {
  const collect = useConfirmed(burrowCollectPlay);
  const lock = useLock();
  const [state, setState] = useState<"idle" | "digging" | "done" | "error">("idle");
  const [got, setGot] = useState({ n: 0, id: 0 });
  const [error, setError] = useState("");

  async function go() {
    setState("digging");
    setError("");
    const [r] = await Promise.all([collect(), new Promise((res) => setTimeout(res, reducedMotion() ? 0 : 650))]);
    if (!r) return;
    if (!r.ok) {
      setError(r.error);
      setState("error");
      return;
    }
    setGot({ n: r.data.coins, id: Date.now() });
    setState("done");
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* The server-rendered amount drops to 0 after collecting; CountUp animates the change. */}
      <span className="text-xl font-semibold">🪙 <CountUp value={ready} /> ready</span>
      <span className="relative inline-flex">
        {state === "digging" && <span aria-hidden className="fx-dig" />}
        <button onClick={() => lock(go)} disabled={ready === 0 || state === "digging"} className={`relative ${className}`} aria-busy={state === "digging"}>
          {state === "digging" ? <><span className="spinner" aria-hidden /> Digging…</> : "Collect"}
        </button>
      </span>
      <span aria-live="polite">
        {state === "done" && (
          <span key={got.id} className="relative inline-block font-semibold text-amber-300 anim-pop">
            +<CountUp value={got.n} from={0} /> 🪙 collected
            <Burst items={["🪙", "🥕", "✨"]} count={14} spread={70} salt={got.id % 89} />
          </span>
        )}
        {state === "error" && <span role="alert" className="inline-block text-red-300 anim-shake">❌ {error}</span>}
      </span>
    </div>
  );
}
