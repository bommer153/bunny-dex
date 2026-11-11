"use client";
// Guide as steps: chips or Prev/Next (or ←/→) move between topics at the player's pace; each step slides in from the
// side you're heading, and its key command plus the matching web page get a short highlight. #topic links still work.
import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { GuideSection } from "@/game/guide";
import { panel } from "../components";

const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };

export default function GuideStepper({ sections, prefix }: { sections: GuideSection[]; prefix: string }) {
  const hash = useSyncExternalStore(subscribe, () => location.hash.slice(1), () => "");
  const idx = Math.max(0, sections.findIndex((s) => s.key === hash));
  const s = sections[idx];
  const [dir, setDir] = useState<"left" | "right">("right");

  function go(i: number) {
    const n = (i + sections.length) % sections.length;
    setDir(n >= idx ? "right" : "left");
    history.replaceState(null, "", `#${sections[n].key}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
  };

  return (
    <div className="flex flex-col gap-4" onKeyDown={onKey}>
      <div role="tablist" aria-label="Guide topics" className="flex flex-wrap gap-2">
        {sections.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={i === idx}
            aria-controls="guide-step"
            onClick={() => go(i)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${i === idx ? "bg-gold-500 text-plum-950" : "bg-plum-800 hover:bg-plum-700"}`}
          >
            {t.emoji} {t.title}
          </button>
        ))}
      </div>

      {/* The mascot points the player at this step's key command. */}
      <div className="flex items-end gap-3" aria-live="polite">
        <Image src="/brand/mascot.png" alt="" width={160} height={160} className="fx-bob size-16 shrink-0 rounded-full ring-2 ring-gold-500/80 sm:size-20" />
        <p key={s.key} className="speech anim-pop relative rounded-2xl border border-gold-500/40 bg-plum-900 px-3 py-2 text-sm text-plum-100">
          {idx === 0 ? "Hi! I'm your BunnyDex guide. " : ""}Try <code className="text-gold-300">{prefix} {s.commands[0].usage.split(" ")[0]}</code> first{s.web ? ", or use the web page below" : ""}. 👇
        </p>
      </div>
      <section id="guide-step" role="tabpanel" aria-label={s.title} key={s.key} className={`${panel} p-4 ${dir === "right" ? "anim-step-r" : "anim-step-l"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">{s.emoji} {s.title}</h2>
          <span className="text-xs text-plum-500">Step {idx + 1} of {sections.length}</span>
        </div>
        <p className="text-sm text-plum-400 mt-1">{s.intro.replace(/`/g, "")}</p>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {s.commands.map((c, i) => (
            <div key={c.usage} className={`rounded-lg bg-plum-950/60 p-3 anim-rise ${i === 0 ? "guide-key" : ""}`} style={{ animationDelay: `${120 + i * 60}ms` }}>
              <dt>
                <code className="text-gold-200 break-words">{prefix} {c.usage}</code>
                {c.aliases && <span className="text-xs text-plum-500"> · also {c.aliases.join(", ")}</span>}
              </dt>
              <dd className="text-sm text-plum-400 mt-1">{c.desc.replace(/`/g, "")}</dd>
            </div>
          ))}
        </dl>
        {s.web && (
          <Link href={s.web} className="guide-key inline-block mt-4 rounded-md bg-plum-800 px-3 py-1.5 text-sm text-gold-300 hover:bg-plum-700">
            Try it on the web →
          </Link>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => go(idx - 1)} className="rounded-md bg-plum-800 px-4 py-2 text-sm hover:bg-plum-700">← {sections[(idx - 1 + sections.length) % sections.length].title}</button>
        <span className="text-xs text-plum-500 hidden sm:inline">Use ← → to move</span>
        <button onClick={() => go(idx + 1)} className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-plum-950 hover:bg-gold-400">{sections[(idx + 1) % sections.length].title} →</button>
      </div>
    </div>
  );
}
