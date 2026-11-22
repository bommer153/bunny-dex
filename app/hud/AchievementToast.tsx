"use client";
// Shows achievements the layout just paid out. A new set of ids (a new `key` from the layout) shows it again.
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AchievementToast({ items }: { items: { id: string; emoji: string; name: string; coins: number }[] }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 7000);
    return () => clearTimeout(t);
  }, []);
  if (!open || !items.length) return null;
  return (
    <div role="status" className="anim-pop fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm flex-col gap-1 rounded-2xl border border-gold-400/70 bg-plum-950/95 p-3 shadow-[0_10px_40px_-10px_rgb(240_177_42/0.6)] lg:bottom-6">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-gold-200">🎖️ Achievement unlocked!</strong>
        <button onClick={() => setOpen(false)} className="text-plum-400 hover:text-white" aria-label="Dismiss">✕</button>
      </div>
      {items.map((a) => (
        <span key={a.id} className="text-sm">{a.emoji} <strong>{a.name}</strong> · +🪙 {a.coins.toLocaleString()}</span>
      ))}
      <Link href="/achievements" className="text-xs text-gold-300 hover:underline" onClick={() => setOpen(false)}>See all achievements →</Link>
    </div>
  );
}
