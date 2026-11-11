// Ornate HUD frame for scene viewports (hunt, battle), after the card back:
// polished gold border, gold corner flourishes with violet gems, a gem crest top and bottom, thin inner line.
import type { ReactNode } from "react";

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const flip = { tl: "", tr: "-scale-x-100", bl: "-scale-y-100", br: "-scale-x-100 -scale-y-100" }[pos];
  const place = { tl: "left-0 top-0", tr: "right-0 top-0", bl: "left-0 bottom-0", br: "right-0 bottom-0" }[pos];
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`pointer-events-none absolute z-10 size-12 sm:size-16 ${place} ${flip} drop-shadow-[0_0_6px_rgb(240_177_42/0.55)]`}>
      <defs>
        <linearGradient id="sf-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" /><stop offset=".45" stopColor="#f0b12a" /><stop offset="1" stopColor="#8f600b" />
        </linearGradient>
        <linearGradient id="sf-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9d5ff" /><stop offset=".5" stopColor="#a855f7" /><stop offset="1" stopColor="#581c87" />
        </linearGradient>
      </defs>
      {/* outer bracket with a curl at each end */}
      <path d="M4 44 V14 Q4 4 14 4 H44" fill="none" stroke="url(#sf-gold)" strokeWidth="4" strokeLinecap="round" />
      <path d="M44 4 q9 0 11 7 q-6 -2 -9 1" fill="none" stroke="url(#sf-gold)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 44 q0 9 7 11 q-2 -6 1 -9" fill="none" stroke="url(#sf-gold)" strokeWidth="2.5" strokeLinecap="round" />
      {/* inner filigree */}
      <path d="M13 32 V19 Q13 13 19 13 H32" fill="none" stroke="url(#sf-gold)" strokeWidth="1.6" opacity=".75" />
      <circle cx="32" cy="13" r="1.8" fill="#ffdb6e" />
      <circle cx="13" cy="32" r="1.8" fill="#ffdb6e" />
      {/* corner gem */}
      <rect x="6" y="6" width="12" height="12" transform="rotate(45 12 12)" fill="url(#sf-gem)" stroke="#ffdb6e" strokeWidth="1.6" />
      <rect x="9.5" y="8.5" width="3" height="3" transform="rotate(45 11 10)" fill="#fff" opacity=".7" />
    </svg>
  );
}

function Crest({ pos }: { pos: "top" | "bottom" }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 ${pos === "top" ? "-top-[7px]" : "-bottom-[7px]"}`}>
      <span className="h-[2px] w-8 rounded-full bg-gradient-to-l from-gold-400 to-transparent sm:w-14" />
      <span className="gem text-base" />
      <span className="h-[2px] w-8 rounded-full bg-gradient-to-r from-gold-400 to-transparent sm:w-14" />
    </div>
  );
}

/** Wraps a scene viewport. `glow` brightens the frame (e.g. after an epic+ reveal). */
export default function StageFrame({ children, glow = false, className = "" }: { children: ReactNode; glow?: boolean; className?: string }) {
  return (
    <div className={`stage-frame relative rounded-2xl p-[3px] ${glow ? "stage-frame-glow" : ""} ${className}`}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
      <Crest pos="top" /><Crest pos="bottom" />
      <div className="relative overflow-hidden rounded-[13px]">
        {children}
        {/* thin inner gold line, inset from the edge */}
        <div aria-hidden className="pointer-events-none absolute inset-2 rounded-lg border border-gold-500/25 sm:inset-3" />
      </div>
    </div>
  );
}
