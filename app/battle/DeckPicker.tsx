"use client";
// Deck builder: tap a card to put it in the next free lane, tap it again (or its lane) to take it out.
// Or drag a card onto a lane (drag lane to lane to swap). The team bonus updates live.
// Lanes follow the order you pick. Saving posts the codes in lane order to the existing setDeck action.
import Image from "next/image";
import { useState } from "react";
import { getCard, type Rarity } from "@/game/data/cards";
import { RARITY_EMOJI, TRAITS, variantInfo } from "@/game/config";
import { teamBonus } from "@/game/synergy";
import { setDeckAction } from "../actions";
import { SubmitButton } from "../SubmitButton";

export type DeckCard = { code: string; slug: string; name: string; rarity: Rarity; variant: string; level: number; stats: string };

const RING: Record<Rarity, string> = {
  common: "ring-plum-600", uncommon: "ring-green-500", rare: "ring-blue-500", epic: "ring-purple-500",
  legendary: "ring-yellow-400", mythic: "ring-red-500", secret: "ring-fuchsia-400",
};

export default function DeckPicker({ cards, deck, size, button, ghostButton }: { cards: DeckCard[]; deck: string[]; size: number; button: string; ghostButton: string }) {
  const known = new Set(cards.map((c) => c.code));
  const [picked, setPicked] = useState<string[]>(() => deck.filter((c) => known.has(c)).slice(0, size));
  const byCode = new Map(cards.map((c) => [c.code, c]));
  const full = picked.length >= size;
  const changed = picked.join() !== deck.join();

  const toggle = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : p.length < size ? [...p, code] : p));
  /** Drop `code` on lane `i`: swaps if it's already in a lane, otherwise replaces that lane's card. */
  const drop = (i: number, code: string) =>
    setPicked((p) => {
      const n: (string | undefined)[] = [...p];
      const j = n.indexOf(code);
      if (j >= 0) [n[i], n[j]] = [n[j], code];
      else n[i] = code;
      return n.filter((c): c is string => !!c).slice(0, size);
    });
  const [over, setOver] = useState<number | null>(null);
  const bonus = teamBonus(picked.map((c) => ({ def: getCard(byCode.get(c)!.slug) })));
  const dragProps = (code: string) => ({ draggable: true, onDragStart: (e: React.DragEvent) => e.dataTransfer.setData("text/plain", code) });
  const dropProps = (i: number) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(i); },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const code = e.dataTransfer.getData("text/plain"); if (byCode.has(code)) drop(i, code); },
  });

  return (
    <form action={setDeckAction} className="flex flex-col gap-3">
      {picked.map((c) => <input key={c} type="hidden" name="codes" value={c} />)}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><span className="gem" aria-hidden /> Your deck</h2>
        <span className="text-sm text-plum-400">Tap a card to add it, tap a lane to empty it.<span className="hidden [@media(pointer:fine)]:inline"> Or drag cards onto lanes (lane to lane swaps).</span></span>
      </div>

      {/* Lane slots: tap one to empty it. */}
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl" aria-live="polite">
        {Array.from({ length: size }, (_, i) => {
          const c = byCode.get(picked[i] ?? "");
          const hl = over === i ? "ring-2 ring-gold-300" : "";
          return c ? (
            <button key={i} type="button" onClick={() => toggle(c.code)} aria-label={`Lane ${i + 1}: ${c.name}. Tap to remove.`} {...dragProps(c.code)} {...dropProps(i)}
              className={`flex items-center gap-2 rounded-xl border border-gold-500/60 bg-gold-500/10 p-1.5 text-left hover:bg-gold-500/20 ${hl}`}>
              <Image src={`/cards/${c.slug}.png`} alt="" width={60} height={84} className="h-14 w-10 shrink-0 rounded object-cover" />
              <span className="min-w-0 text-xs">
                <span className="block text-[10px] uppercase tracking-wider text-gold-300">Lane {i + 1}</span>
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block text-plum-400">{TRAITS[getCard(c.slug).element].name} · ✕</span>
              </span>
            </button>
          ) : (
            <div key={i} {...dropProps(i)} className={`flex h-[4.25rem] items-center justify-center rounded-xl border-2 border-dashed border-plum-700 text-xs text-plum-500 ${hl}`}>Lane {i + 1} · drop here</div>
          );
        })}
      </div>

      <p className="text-sm" aria-live="polite">
        <span className="text-plum-400">Team bonus: </span>
        {bonus.notes.length ? <span className="font-medium text-gold-300">{bonus.notes.join(" · ")}</span> : <span className="text-plum-500">none yet. Try 2–3 of one element, 3 from one set, or a ✨ light card.</span>}
      </p>

      <div className="flex flex-wrap gap-2">
        <SubmitButton className={button} pending="Saving…" disabled={!picked.length || !changed}>
          {!picked.length ? "Pick at least 1 card" : changed ? "💾 Save deck" : "✓ Deck saved"}
        </SubmitButton>
        <button type="button" className={ghostButton} onClick={() => setPicked([])} disabled={!picked.length}>Clear</button>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
        {cards.map((c) => {
          const lane = picked.indexOf(c.code);
          const on = lane >= 0;
          const blocked = !on && full;
          return (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => toggle(c.code)}
                {...dragProps(c.code)}
                aria-disabled={blocked}
                aria-pressed={on}
                aria-label={`${c.name}, level ${c.level}${on ? `, in lane ${lane + 1}. Tap to remove.` : blocked ? ", deck is full" : ". Tap to add to your deck."}`}
                className={`card-tile relative flex w-full flex-col gap-1.5 rounded-xl bg-plum-900 p-2 text-left sm:p-3 ring-2 ${on ? "ring-gold-400 shadow-[0_0_24px_-6px_rgb(240_177_42/0.7)]" : RING[c.rarity]} ${blocked ? "opacity-40" : ""} disabled:cursor-not-allowed`}
              >
                {on && (
                  <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-plum-950 shadow">
                    <span className="gem" aria-hidden /> Lane {lane + 1}
                  </span>
                )}
                <Image src={`/cards/${c.slug}.png`} alt="" width={240} height={336} className="h-auto w-full rounded-lg" />
                <span className="text-sm font-semibold leading-tight">{RARITY_EMOJI[c.rarity]} {c.variant !== "normal" && `${variantInfo(c.variant).name} `}{c.name}</span>
                <span className="text-[11px] text-plum-400 sm:text-xs">{c.stats}</span>
                <span className={`text-xs font-medium ${on ? "text-gold-300" : "text-plum-400"}`}>{on ? "✓ In deck" : blocked ? "Deck full" : "+ Add"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
