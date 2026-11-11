"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { reducedMotion } from "./stage";

// Deterministic "random" so rendering stays pure; each burst still looks scattered.
const jitter = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** One-shot DOM particle burst from the centre of its (relative) parent. Change `key` to replay. */
export function Burst({ items = ["🪙"], count = 12, spread = 80, salt = 1 }: { items?: string[]; count?: number; spread?: number; salt?: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + jitter(i, salt) * 0.8;
        const dist = spread * (0.6 + jitter(i, salt + 1) * 0.6);
        const style = {
          "--dx": `${Math.cos(angle) * dist}px`,
          "--dy": `${Math.sin(angle) * dist - spread * 0.35}px`,
          "--rot": `${(jitter(i, salt + 2) - 0.5) * 360}deg`,
          animationDelay: `${jitter(i, salt + 3) * 80}ms`,
        } as CSSProperties;
        return <span key={i} className="fx-particle" style={style}>{items[i % items.length]}</span>;
      })}
    </span>
  );
}

/** A stamp ("SOLD!", "PURCHASED") that slams onto the centre of the screen, with a coin burst. */
export function Stamp({ text, tone = "gold" }: { text: string; tone?: "gold" | "violet" | "grey" | "seal" }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), reducedMotion() ? 900 : 1600);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {tone === "seal" ? (
        // Gold wax-style seal with a gem, for closed auctions.
        <div className="fx-seal relative">
          <span className="gem absolute left-1/2 top-4 -translate-x-1/2 text-xl" />
          <span className="fx-seal-text">{text}</span>
          <Burst items={["🪙", "✨", "◆"]} count={18} spread={150} />
        </div>
      ) : (
        <div className={`fx-stamp fx-stamp-${tone} relative`}>
          {text}
          {tone !== "grey" && <Burst items={["🪙", "✨"]} count={16} spread={140} />}
        </div>
      )}
    </div>
  );
}

/** Counts from the previously shown number to `value` whenever `value` changes. */
export function CountUp({ value, from, ms = 700, format = (n: number) => n.toLocaleString() }: { value: number; from?: number; ms?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const t0 = performance.now();
    const dur = reducedMotion() ? 0 : ms;
    let raf = 0;
    const step = (t: number) => {
      const k = dur ? Math.min(1, (t - t0) / dur) : 1;
      const n = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      current.current = n;
      setShown(n);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{format(shown)}</span>;
}
