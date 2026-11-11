"use client";
// Leaderboard rows. Prior ranks = the last ranking this browser showed (localStorage). When that exists, rows slide
// from their old position (FLIP) and show ▲/▼; without it, no movement is shown. Top 3 get a short entrance flourish.
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { reducedMotion } from "../fx/stage";

export type RankRow = { id: string; name: string; value: string };
const MEDAL = ["🥇", "🥈", "🥉"];

// The previous ranking is read once per page load and cached, so saving the new ranking (and React re-running
// effects) never changes what this view compares against.
const cache = new Map<string, string | null>();
const read = (key: string) => {
  if (!cache.has(key)) {
    let v: string | null = null;
    try { v = localStorage.getItem(key); } catch { /* storage blocked: no prior data */ }
    cache.set(key, v);
  }
  return cache.get(key) ?? null;
};
const noop = () => () => {};

export default function RankList({ kind, rows, me }: { kind: string; rows: RankRow[]; me?: string | null }) {
  const key = `bd.lb.${kind}`;
  const raw = useSyncExternalStore(noop, () => read(key), () => null);
  const prev: Record<string, number> | null = raw ? (JSON.parse(raw) as Record<string, number>) : null;
  const refs = useRef(new Map<string, HTMLLIElement>());
  const order = rows.map((r) => r.id).join(",");

  // Save this ranking for next time, but cache the previous one first (hydration renders with no snapshot,
  // and React reads the client snapshot only after this effect).
  useLayoutEffect(() => {
    read(key);
    try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(rows.map((r, i) => [r.id, i])))); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the ranking itself changes
  }, [key, order]);

  // Slide rows from their previous position once the previous ranking is known.
  useLayoutEffect(() => {
    if (!prev || reducedMotion()) return;
    rows.forEach((r, i) => {
      const el = refs.current.get(r.id);
      const was = prev[r.id];
      if (!el || was === undefined || was === i) return;
      const step = el.offsetHeight + 8; // row height + gap-2
      el.animate([{ transform: `translateY(${(was - i) * step}px)`, background: "#3f3f46" }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(.2,.8,.3,1)", delay: 150 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prev is derived from raw
  }, [raw, order]);

  const moveOf = (r: RankRow, i: number) => {
    const was = prev?.[r.id];
    return prev ? (was === undefined ? "new" : was - i) : null;
  };
  const Move = ({ m }: { m: ReturnType<typeof moveOf> }) =>
    m === "new" ? <span className="text-xs text-sky-300">new</span>
      : typeof m === "number" && m > 0 ? <span className="text-xs text-emerald-400" aria-label={`up ${m}`}>▲{m}</span>
      : typeof m === "number" && m < 0 ? <span className="text-xs text-red-400" aria-label={`down ${-m}`}>▼{-m}</span> : null;
  const You = ({ id }: { id: string }) => (id === me ? <span className="rounded-full bg-gold-500/20 px-1.5 text-[10px] font-semibold text-gold-200">◆ you</span> : null);

  // Podium order 2-1-3 with 1st tallest.
  const podium = [1, 0, 2].map((i) => ({ r: rows[i], i })).filter((p) => p.r);
  const HEIGHT = ["h-28", "h-20", "h-16"];
  return (
    <div className="flex max-w-xl flex-col gap-4">
      {podium.length > 0 && (
        <ol className="grid grid-cols-3 items-end gap-2" aria-label="Top 3">
          {podium.map(({ r, i }) => (
            <li key={r.id} className="anim-pop flex flex-col items-center gap-1 text-center" style={{ animationDelay: `${(2 - i) * 120}ms`, order: i === 0 ? 2 : i === 1 ? 1 : 3 }}>
              <span className="text-3xl" aria-hidden>{MEDAL[i]}</span>
              <span className={`flex max-w-full items-center gap-1 truncate text-sm font-semibold ${r.id === me ? "text-gold-200" : ""}`}>{r.name}</span>
              <span className="flex items-center gap-1 text-xs"><You id={r.id} /><Move m={moveOf(r, i)} /></span>
              <div className={`w-full ${i === 0 ? "gold-frame" : "rounded-xl border border-gem/60 bg-gradient-to-b from-violet-800/50 to-plum-950 p-[3px]"}`}>
                <div className={`${i === 0 ? "gold-frame-inner card-shine" : "rounded-[10px]"} flex ${HEIGHT[i]} flex-col items-center justify-center gap-1`}>
                  <span className="text-xs uppercase tracking-widest text-plum-400"><span className="sr-only">Rank </span>#{i + 1}</span>
                  <span className={`text-sm font-bold tabular-nums ${i === 0 ? "text-goldfoil" : "text-plum-100"}`}>{r.value}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ol className="flex flex-col gap-2" start={4}>
        {rows.slice(3).map((r, k) => {
          const i = k + 3;
          return (
            <li
              key={r.id}
              ref={(el) => { if (el) refs.current.set(r.id, el); else refs.current.delete(r.id); }}
              aria-current={r.id === me ? "true" : undefined}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2 ${r.id === me ? "border-gold-500/70 bg-gold-500/10" : "border-plum-800 bg-plum-900"}`}
            >
              <span className="flex items-center gap-2">
                <span className="w-7 text-center tabular-nums text-plum-400">{i + 1}.</span>
                {r.name}
                <You id={r.id} />
                <Move m={moveOf(r, i)} />
              </span>
              <span className="tabular-nums">{r.value}</span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-plum-500">No players yet.</li>}
      </ol>
    </div>
  );
}
