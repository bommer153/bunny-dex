"use client";
// Combine Lab: click a card and it flies into the next free slot (click a slotted card to send it back).
// Combine starts the server request at once and plays a neutral energy build-up (stronger and longer for rarer cards)
// while it is pending. Only the confirmed result decides what follows: merge + flash + 3D reveal on success,
// a grey fizzle on failure, or a red shake with the cards flying back if the server rejected the combine. Skippable.
import Image from "next/image";
import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { RARITIES, getCard, type Rarity } from "@/game/data/cards";
import { COMBINE_CHANCE, COMBINE_COUNT, RARITY_EMOJI, variantInfo } from "@/game/config";
import { combinePlay } from "../actions";
import CardStage from "../CardStage";
import { panel } from "../components";
import { reducedMotion } from "../fx/stage";
import { useConfirmed, useLock } from "../fx/useConfirmed";

export type LabCard = { code: string; slug: string; variant: string; level: number };
type Rect = { left: number; top: number; width: number; height: number };
type Flight = { id: number; card: LabCard; from: Rect; to: Rect; back: boolean };
type Slot = { card: LabCard; landed: boolean } | null;
type Outcome = Extract<Awaited<ReturnType<typeof combinePlay>>, { ok: true }>["data"];
type Phase = "idle" | "charging" | "merging" | "flash" | "fizzle" | "result" | "rejected";
type SortKey = "rarity" | "-rarity" | "copies" | "level" | "name";

// How hard (px) and how long (ms) the slots shake, by the rarity being combined.
const SHAKE: Record<Rarity, { px: number; ms: number }> = {
  common: { px: 2, ms: 900 }, uncommon: { px: 3, ms: 1100 }, rare: { px: 5, ms: 1400 }, epic: { px: 8, ms: 1700 },
  legendary: { px: 11, ms: 2100 }, mythic: { px: 15, ms: 2600 }, secret: { px: 0, ms: 0 },
};
const COLOR: Record<Rarity, string> = {
  common: "#a1a1aa", uncommon: "#4ade80", rare: "#60a5fa", epic: "#c084fc", legendary: "#facc15", mythic: "#f87171", secret: "#f0abfc",
};
const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;
const next = (r: Rarity) => RARITIES[RANK[r] + 1] as Rarity | undefined;
const rectOf = (el: Element | null | undefined): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** A copy of the card that flies in an arc from one box to another, then reports back. */
function Flyer({ f, onDone }: { f: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  // Layout effect so the flight starts before the first paint.
  useLayoutEffectOnce(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !el.animate) return void done.current();
    const dx = f.to.left - f.from.left, dy = f.to.top - f.from.top, s = f.to.width / f.from.width;
    const spin = f.back ? -14 : 14;
    const a = el.animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0deg)" },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(${((1 + s) / 2) * 1.15}) rotate(${spin}deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)` },
      ],
      { duration: 520, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" },
    );
    a.onfinish = () => done.current();
    return () => a.cancel();
  });
  return (
    <div ref={ref} aria-hidden className="fixed z-50 pointer-events-none origin-top-left drop-shadow-2xl" style={{ left: f.from.left, top: f.from.top, width: f.from.width, height: f.from.height }}>
      <Image src={`/cards/${f.card.slug}.png`} alt="" width={240} height={336} className="size-full rounded-lg" />
    </div>
  );
}
function useLayoutEffectOnce(fn: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per flight (each Flyer is keyed by flight id)
  useLayoutEffect(fn, []);
}

/** `spare`: codes safe to auto-combine, cheapest first (from rules.spareCards; your best copy of each bunny is never in it). */
export default function CombineLab({ cards, spare }: { cards: LabCard[]; spare: string[] }) {
  const run = useConfirmed(combinePlay);
  const lock = useLock();
  const [slots, setSlots] = useState<Slot[]>(Array(COMBINE_COUNT).fill(null));
  const [flights, setFlights] = useState<Flight[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [say, setSay] = useState(""); // screen-reader announcements
  const [show, setShow] = useState<Rarity | "all">("all");
  const [sort, setSort] = useState<SortKey>("rarity");
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const labRef = useRef<HTMLDivElement>(null);
  const flightId = useRef(0);
  const skipRef = useRef(false);

  const filled = slots.filter((s): s is NonNullable<Slot> => !!s);
  const rarity = filled[0] ? getCard(filled[0].card.slug).rarity : undefined;
  const target = rarity && next(rarity);
  const busy = phase !== "idle";
  const inUse = new Set([...filled.map((s) => s.card.code), ...flights.map((f) => f.card.code)]);
  const ready = filled.length === COMBINE_COUNT && filled.every((s) => s.landed) && !busy;

  const fly = (card: LabCard, from: Rect, to: Rect, back: boolean) => setFlights((fs) => [...fs, { id: ++flightId.current, card, from, to, back }]);
  const land = (code: string) => setSlots((all) => all.map((x) => (x?.card.code === code ? { ...x, landed: true } : x)));

  function pick(card: LabCard) {
    const r = getCard(card.slug).rarity;
    const idx = slots.findIndex((s) => !s);
    if (busy || idx < 0 || inUse.has(card.code) || (rarity && r !== rarity)) return;
    const from = rectOf(itemRefs.current.get(card.code));
    const to = rectOf(slotRefs.current[idx]);
    setSlots((s) => s.map((x, i) => (i === idx ? { card, landed: false } : x)));
    setSay(`${getCard(card.slug).name} added to slot ${idx + 1}.`);
    if (from && to) fly(card, from, to, false);
    else land(card.code);
  }

  /** Auto fill: tops up the empty slots with the cheapest spare duplicates (the slotted rarity, else the filter, else the lowest rarity with enough). */
  function autoFill() {
    const free = slots.flatMap((s, i) => (s ? [] : [i]));
    if (busy || !free.length) return;
    const byCode = new Map(cards.map((c) => [c.code, c]));
    const pool = spare.flatMap((code) => (byCode.has(code) && !inUse.has(code) ? [byCode.get(code)!] : []));
    const of = (r: Rarity) => pool.filter((c) => getCard(c.slug).rarity === r);
    const r = rarity ?? (show !== "all" ? show : RARITIES.find((x) => of(x).length >= free.length));
    const picks = r ? of(r).slice(0, free.length) : [];
    if (picks.length < free.length) {
      setError(`Not enough spare ${r ?? "same-rarity"} duplicates to auto fill. Your best copy of each bunny is never used.`);
      return;
    }
    setError("");
    setSlots((s) => s.map((x, i) => (free.includes(i) ? { card: picks[free.indexOf(i)], landed: false } : x)));
    setSay(`Auto fill: ${picks.map((c) => getCard(c.slug).name).join(", ")}.`);
    picks.forEach((card, k) => {
      const from = rectOf(itemRefs.current.get(card.code));
      const to = rectOf(slotRefs.current[free[k]]);
      if (from && to) fly(card, from, to, false);
      else land(card.code);
    });
  }

  /** Sends slotted cards back to the grid (one slot, or all of them). */
  function sendBack(only?: number) {
    slots.forEach((s, i) => {
      if (!s || (only !== undefined && i !== only)) return;
      const from = rectOf(slotRefs.current[i]);
      const to = rectOf(itemRefs.current.get(s.card.code));
      if (from && to) fly(s.card, from, to, true);
    });
    setSlots((all) => all.map((x, i) => (only === undefined || i === only ? null : x)));
  }
  function unpick(idx: number) {
    const s = slots[idx];
    if (busy || !s?.landed) return;
    setSay(`${getCard(s.card.slug).name} removed from slot ${idx + 1}.`);
    sendBack(idx);
  }

  /** Waits ms, or less if the player presses Skip. */
  const pause = (ms: number) =>
    new Promise<void>((res) => {
      const t0 = performance.now();
      const tick = () => (skipRef.current || performance.now() - t0 >= ms ? res() : requestAnimationFrame(tick));
      tick();
    });

  /** Neutral build-up: shake and glow ramp up (CSS vars, no re-render per frame). */
  function charge(r: Rarity) {
    const { px, ms } = SHAKE[r];
    if (RANK[r] >= RANK.rare) navigator.vibrate?.([Math.round(ms * 0.4), 60, Math.round(ms * 0.4)]); // phones only
    let start = -1;
    return new Promise<void>((resolve) => {
      const tick = (t: number) => {
        if (start < 0) start = t; // first frame's timestamp
        const p = Math.min(1, (t - start) / ms);
        const amp = px * (0.25 + 0.75 * p * p);
        labRef.current?.style.setProperty("--amp", String(amp));
        labRef.current?.style.setProperty("--amp-panel", String(RANK[r] >= RANK.rare ? amp * 0.3 : 0));
        labRef.current?.style.setProperty("--glow", String(8 + 40 * p));
        if (p < 1 && !skipRef.current) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async function combine(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || !rarity) return;
    const codes = filled.map((s) => s.card.code);
    const reduced = reducedMotion();
    skipRef.current = false;
    setSkipped(false);
    setError("");
    setOutcome(null);
    setPhase("charging");
    setSay("Combining…");
    // Request and build-up run together; the payoff waits for the confirmed result.
    const [r] = await Promise.all([run(codes), reduced ? Promise.resolve() : charge(rarity)]);
    if (!r) return; // left the page
    if (!r.ok) {
      setError(r.error);
      setPhase("rejected");
      setSay(`Combine rejected: ${r.error}`);
      await pause(reduced ? 0 : 600);
      sendBack();
      setPhase("idle");
      return;
    }
    setOutcome(r.data);
    if (!reduced && !skipRef.current) {
      setPhase("merging");
      await pause(450);
      setPhase(r.data.success ? "flash" : "fizzle");
      await pause(r.data.success ? 320 : 750);
    }
    setSay(r.data.success ? `Success! You got ${r.data.name}.` : `The combine failed. You kept ${r.data.name}.`);
    setPhase("result");
  }

  function skip() {
    skipRef.current = true;
    setSkipped(true);
  }

  function again() {
    setSlots(Array(COMBINE_COUNT).fill(null)); // the consumed cards are already gone from the grid
    setOutcome(null);
    setSkipped(false);
    setPhase("idle");
  }

  const glowColor = COLOR[(outcome?.success ? outcome.rarity : undefined) ?? target ?? rarity ?? "common"];
  // Filter + sort the card list (client-side, instant). Slotted cards stay in the list as invisible placeholders.
  const copies = cards.reduce<Record<string, number>>((m, c) => ({ ...m, [c.slug]: (m[c.slug] ?? 0) + 1 }), {});
  const perRarity = cards.reduce<Partial<Record<Rarity, number>>>((m, c) => { const r = getCard(c.slug).rarity; return { ...m, [r]: (m[r] ?? 0) + 1 }; }, {});
  const order: Record<SortKey, (a: LabCard, b: LabCard) => number> = {
    rarity: (a, b) => RANK[getCard(a.slug).rarity] - RANK[getCard(b.slug).rarity] || b.level - a.level,
    "-rarity": (a, b) => RANK[getCard(b.slug).rarity] - RANK[getCard(a.slug).rarity] || b.level - a.level,
    copies: (a, b) => copies[b.slug] - copies[a.slug] || a.slug.localeCompare(b.slug),
    level: (a, b) => b.level - a.level || RANK[getCard(b.slug).rarity] - RANK[getCard(a.slug).rarity],
    name: (a, b) => getCard(a.slug).name.localeCompare(getCard(b.slug).name),
  };
  const sorted = cards.filter((c) => show === "all" || getCard(c.slug).rarity === show).sort(order[sort]);
  const animating = phase === "charging" || phase === "merging" || phase === "flash" || phase === "fizzle";

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={labRef}
        className={`${panel} relative overflow-hidden p-5 ${phase === "charging" ? "lab-shaking" : ""} ${phase === "rejected" ? "lab-reject" : ""} ${phase === "fizzle" ? "lab-fizzle" : ""}`}
        style={{ "--glow-color": glowColor, "--amp": 0, "--amp-panel": 0, "--glow": 0 } as CSSProperties}
      >
        <div className="lab-aura" aria-hidden style={{ opacity: busy ? 1 : filled.length / (COMBINE_COUNT * 2) }} />

        {phase === "result" && outcome ? (
          <div className="relative flex flex-col items-center gap-3 text-center">
            {outcome.success ? (
              <>
                <div className="gold-frame w-56 sm:w-64"><div className="gold-frame-inner p-2"><CardStage key={outcome.card.code} slug={outcome.card.slug} name={outcome.name} rarity={outcome.rarity} variant={outcome.card.variant} skip={skipped} /></div></div>
                <p className="text-xl font-semibold anim-pop text-goldfoil">
                  🧪✨ {RARITY_EMOJI[outcome.rarity]} {outcome.card.variant !== "normal" && `${variantInfo(outcome.card.variant).name} `}{outcome.name}
                </p>
                <p className="text-sm text-plum-400">{outcome.from} → <strong>{outcome.rarity}</strong> · code <code>{outcome.card.code}</code></p>
              </>
            ) : (
              <>
                <p className="text-4xl anim-pop" aria-hidden>💨</p>
                <p className="text-xl font-semibold text-plum-300 anim-pop">Poof! The combine failed.</p>
                <p className="text-sm text-plum-400">{Math.round(outcome.chance * 100)}% chance · you kept <strong>{outcome.name}</strong> <code>{outcome.kept}</code>; the other two were used up.</p>
              </>
            )}
            <button onClick={again} className="rounded-md bg-gold-500 px-5 py-2 font-semibold text-plum-950 hover:bg-gold-400">🧪 Combine again</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); lock(() => combine(e)); }} className="relative flex flex-col items-center gap-4">
            <div className="flex justify-center gap-3 sm:gap-5">
              {slots.map((s, i) => {
                const merge: CSSProperties =
                  phase === "merging" || phase === "flash" || phase === "fizzle"
                    ? { transform: `translateX(calc(${1 - i} * (100% + 1.25rem))) scale(0.55)`, opacity: i === 1 ? 1 : 0.15 }
                    : {};
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => unpick(i)}
                    disabled={!s?.landed || busy}
                    aria-label={s ? `Slot ${i + 1}: ${getCard(s.card.slug).name}. Click to remove.` : `Slot ${i + 1}: empty`}
                    className="lab-slot w-24 sm:w-36 rounded-xl"
                  >
                    <div
                      ref={(el) => { slotRefs.current[i] = el; }}
                      className={`relative aspect-[5/7] rounded-xl border-2 ${s ? "border-transparent" : "border-dashed border-plum-700"} flex items-center justify-center text-plum-600 text-sm`}
                    >
                      {!s && <span>Slot {i + 1}</span>}
                      {s && (
                        <div className={`absolute inset-0 transition-all duration-[450ms] ease-in ${s.landed ? "lab-land" : "opacity-0"}`} style={merge}>
                          <Image src={`/cards/${s.card.slug}.png`} alt="" width={240} height={336} className="size-full rounded-xl" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-plum-300 text-center min-h-5">
              {phase === "charging" && <><span className="spinner" aria-hidden /> Combining…</>}
              {phase === "idle" && (rarity && target ? (
                <>
                  {RARITY_EMOJI[rarity]} {rarity} ×{COMBINE_COUNT} → {RARITY_EMOJI[target]} <strong>{target}</strong> · <strong>{Math.round(COMBINE_CHANCE[rarity] * 100)}%</strong> chance.
                  {" "}On failure you keep the best one.
                </>
              ) : (
                <span className="flex flex-wrap justify-center gap-1.5 text-xs">
                  {[`${COMBINE_COUNT} cards`, "same rarity", "available", "not in your deck"].map((r) => (
                    <span key={r} className="flex items-center gap-1 rounded-full border border-plum-700 px-2 py-0.5 text-plum-300"><span className="gem" aria-hidden />{r}</span>
                  ))}
                </span>
              ))}
            </p>
            {error && <p role="alert" className="text-sm text-red-300 anim-shake">❌ {error}</p>}
            <div className="flex gap-3">
              {animating ? (
                <button type="button" onClick={skip} disabled={skipped} className="rounded-md bg-plum-800 px-4 py-2 text-sm hover:bg-plum-700 disabled:opacity-60">
                  {skipped ? "Finishing…" : "Skip"}
                </button>
              ) : (
                <>
                  <button className="rounded-md bg-gold-500 px-5 py-2 font-semibold text-plum-950 hover:bg-gold-400 disabled:opacity-40" disabled={!ready}>🧪 Combine</button>
                  <button type="button" onClick={autoFill} disabled={busy || filled.length >= COMBINE_COUNT} title="Fill the empty slots with your cheapest spare duplicates" className="rounded-md border border-gold-500/60 bg-plum-800 px-4 py-2 text-sm hover:bg-plum-700 disabled:opacity-40">
                    🤖 Auto fill
                  </button>
                  <button type="button" className="rounded-md bg-plum-800 px-4 py-2 text-sm hover:bg-plum-700 disabled:opacity-40" disabled={busy || !filled.some((s) => s.landed)} onClick={() => sendBack()}>
                    Clear
                  </button>
                </>
              )}
            </div>
          </form>
        )}
        {phase === "flash" && <div className="lab-flash" aria-hidden />}
        <p className="sr-only" aria-live="polite">{say}</p>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Your cards <span className="text-sm text-plum-500 font-normal">(available, not in your deck)</span></h2>
          <label className="flex items-center gap-2 text-xs text-plum-400">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-plum-700 bg-plum-950/70 px-2 py-1 text-base sm:text-sm text-plum-100 focus:outline-none focus:ring-2 focus:ring-gold-400">
              <option value="rarity">Rarity: low → high</option>
              <option value="-rarity">Rarity: high → low</option>
              <option value="copies">Most copies first</option>
              <option value="level">Level: high → low</option>
              <option value="name">Name: A → Z</option>
            </select>
          </label>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Filter by rarity">
          {(["all", ...RARITIES.filter((r) => perRarity[r])] as const).map((r) => {
            const on = show === r;
            const matchesSlots = r !== "all" && rarity === r; // the rarity already in the slots
            return (
              <button
                key={r}
                type="button"
                onClick={() => setShow(r)}
                aria-pressed={on}
                className={`rounded-full px-3 py-1 transition-colors ${on ? "bg-gold-500 font-semibold text-plum-950" : "bg-plum-800 hover:bg-plum-700"} ${matchesSlots && !on ? "ring-1 ring-gold-500/70" : ""}`}
              >
                {on && "◆ "}{r === "all" ? "All" : `${RARITY_EMOJI[r]} ${r}`} <span className="tabular-nums opacity-80">{r === "all" ? cards.length : perRarity[r]}</span>
              </button>
            );
          })}
        </div>
        {cards.length === 0 && <p className="text-plum-500 text-sm">No available cards. Hunt some first!</p>}
        {cards.length > 0 && sorted.length === 0 && <p className="text-plum-500 text-sm">No {show} cards available.</p>}
        <ul className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {sorted.map((c) => {
            const def = getCard(c.slug);
            const used = inUse.has(c.code);
            const blocked = def.rarity === "secret" || (!!rarity && def.rarity !== rarity);
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  disabled={used || blocked || busy || filled.length >= COMBINE_COUNT}
                  aria-label={`Add ${def.name} level ${c.level} to a slot`}
                  className={`w-full text-left rounded-lg p-1 transition-opacity ${blocked ? "opacity-25" : "hover:bg-plum-800"} disabled:cursor-not-allowed`}
                >
                  <div ref={(el) => { if (el) itemRefs.current.set(c.code, el); else itemRefs.current.delete(c.code); }} className={`aspect-[5/7] ${used ? "invisible" : ""}`}>
                    <Image src={`/cards/${c.slug}.png`} alt="" width={120} height={168} className="size-full rounded-md" />
                  </div>
                  <div className="text-[11px] leading-tight mt-1 truncate">{RARITY_EMOJI[def.rarity]} {def.name}</div>
                  <div className="text-[10px] text-plum-500 truncate">Lv{c.level}{c.variant !== "normal" && ` · ${variantInfo(c.variant).name}`}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {flights.map((f) => (
        <Flyer
          key={f.id}
          f={f}
          onDone={() => {
            setFlights((fs) => fs.filter((x) => x.id !== f.id));
            if (!f.back) land(f.card.code);
          }}
        />
      ))}
    </div>
  );
}
