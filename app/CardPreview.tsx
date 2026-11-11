"use client";
// Focused card preview: clicking the art opens a dialog with the 3D card (drag/keys to turn, flip, foil).
// The 3D scene only mounts while the dialog is open, so closed tiles cost nothing.
import { useRef, useState, type ReactNode } from "react";
import type { Rarity } from "@/game/data/cards";
import CardStage from "./CardStage";

export default function CardPreview({ slug, name, rarity, variant, stats, code, children }: {
  slug: string; name: string; rarity: Rarity; variant: string; stats: string; code?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); ref.current?.showModal(); }}
        aria-label={`Preview ${name} in 3D`}
        className="block w-full rounded-lg cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        {children}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && ref.current?.close()} // click the backdrop to close
        aria-label={`${name} preview`}
        className="fx-dialog m-auto w-[min(92vw,380px)] rounded-2xl bg-plum-900 p-4 text-plum-100 backdrop:bg-black/70"
      >
        {open && (
          <div className="flex flex-col items-center gap-3">
            <CardStage slug={slug} name={name} rarity={rarity} variant={variant} mode="inspect" />
            <div className="text-center">
              <p className="font-semibold">{name}</p>
              <p className="text-xs text-plum-400">{rarity}{variant !== "normal" && ` · ${variant}`} · {stats}{code && ` · ${code}`}</p>
            </div>
            <form method="dialog"><button className="rounded-md bg-plum-800 px-4 py-1.5 text-sm hover:bg-plum-700">Close</button></form>
          </div>
        )}
      </dialog>
    </>
  );
}
