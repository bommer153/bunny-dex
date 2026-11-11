import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CARDS, RARITIES, getCard, type Rarity } from "@/game/data/cards";
import { RARITY_EMOJI, variantInfo } from "@/game/config";
import { cardStats } from "@/game/rules";
import CardPreview from "./CardPreview";

export const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-plum-300", uncommon: "text-green-400", rare: "text-blue-400", epic: "text-purple-400",
  legendary: "text-yellow-400", mythic: "text-red-400", secret: "text-fuchsia-300",
};
const RARITY_RING: Record<Rarity, string> = {
  common: "ring-plum-600", uncommon: "ring-green-500", rare: "ring-blue-500", epic: "ring-purple-500",
  legendary: "ring-yellow-400", mythic: "ring-red-500", secret: "ring-fuchsia-400",
};

const SHINY = new Set<Rarity>(["legendary", "mythic", "secret"]);

/**
 * Card art + name + stats. `children` renders under it (e.g. action forms).
 * `index` staggers the entrance, `tilt` follows the pointer on desktop, `preview` opens a 3D close-up on click.
 */
export function CardTile({ slug, variant = "normal", level = 1, code, status, href, index, tilt, preview, children }: {
  slug: string; variant?: string; level?: number; code?: string; status?: string; href?: string;
  index?: number; tilt?: boolean; preview?: boolean; children?: ReactNode;
}) {
  const def = getCard(slug);
  const s = cardStats(def, level);
  const art = <Image src={`/cards/${slug}.png`} alt={def.name} width={240} height={336} className="w-full h-auto rounded-lg" />;
  const stats = `Lv ${level} · ⚔️${s.atk} 🛡️${s.def} ❤️${s.hp} · ${def.element}`;
  const top = preview
    ? <CardPreview slug={slug} name={def.name} rarity={def.rarity} variant={variant} stats={stats} code={code}>{art}</CardPreview>
    : href ? <Link href={href}>{art}</Link> : art;
  return (
    <div
      className={`card-tile rounded-xl bg-plum-900 p-3 ring-2 ${RARITY_RING[def.rarity]} flex flex-col gap-2 ${SHINY.has(def.rarity) ? "card-shine" : ""} ${tilt ? "tilt" : ""} ${index !== undefined ? "anim-rise" : ""}`}
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 35}ms` } : undefined}
    >
      {top}
      <div>
        <div className={`font-semibold ${RARITY_TEXT[def.rarity]}`}>
          {RARITY_EMOJI[def.rarity]} {variant !== "normal" && `${variantInfo(variant).name} `}{def.name}
        </div>
        <div className="text-xs text-plum-400">
          {stats}
          {code && <> · <code className="text-plum-300">{code}</code></>}
          {status && status !== "available" && <> · <em>{status}</em></>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p key={err ?? ok} role="status" className={`rounded-lg px-4 py-2 ${err ? "bg-red-950 text-red-200 anim-shake" : "bg-emerald-950 text-emerald-200 anim-pop"}`}>
      {err ? `❌ ${err}` : `✅ ${ok}`}
    </p>
  );
}

export const input = "rounded-md border border-plum-700 bg-plum-950/70 px-2 py-1 text-sm w-full min-w-0 placeholder:text-plum-500 focus:outline-none focus:ring-2 focus:ring-gold-400";
/** Primary action: polished gold. Disabled = dimmed + not-allowed cursor (callers also say why in the label). */
export const button =
  "rounded-md bg-gradient-to-b from-gold-300 to-gold-500 px-3 py-1 text-sm font-semibold text-plum-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_2px_10px_-2px_rgb(240_177_42/0.5)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";
export const ghostButton = "rounded-md border border-plum-700 bg-plum-800/80 px-3 py-1 text-sm hover:border-gold-500/60 hover:bg-plum-700 disabled:cursor-not-allowed disabled:opacity-40";
/** Raised plum panel for HUD sections. */
export const panel = "rounded-2xl border border-plum-800 bg-gradient-to-b from-plum-900 to-plum-950/90 shadow-[0_10px_40px_-20px_rgb(124_58_237/0.6)]";

/** Search + rarity + sort bar (plain GET form: works without JS and keeps filters in the URL). */
export function FilterBar({ action, q, rarity, sort, sorts }: {
  action: string; q?: string; rarity?: string; sort?: string; sorts?: [value: string, label: string][];
}) {
  return (
    <form action={action} role="search" className={`${panel} flex flex-wrap items-end gap-2 p-3`}>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-plum-400">
        <span className="flex items-center gap-1"><span className="gem" aria-hidden /> Search</span>
        <input name="q" defaultValue={q} placeholder="Card name…" className={`${input} py-1.5`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-plum-400">
        Rarity
        <select name="rarity" defaultValue={rarity ?? ""} className={`${input} py-1.5`}>
          <option value="">All rarities</option>
          {RARITIES.map((r) => <option key={r} value={r}>{RARITY_EMOJI[r]} {r}</option>)}
        </select>
      </label>
      {sorts && (
        <label className="flex flex-col gap-1 text-xs text-plum-400">
          Sort
          <select name="sort" defaultValue={sort ?? sorts[0][0]} className={`${input} py-1.5`}>
            {sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}
      <button className={`${button} py-1.5`}>Apply</button>
      {(q || rarity) && <Link href={action} className={`${ghostButton} py-1.5`}>Clear</Link>}
    </form>
  );
}

/** Card slugs matching a name search and/or rarity (undefined = no filter). */
export function matchSlugs(q?: string, rarity?: string) {
  if (!q && !rarity) return undefined;
  const needle = q?.trim().toLowerCase() ?? "";
  return CARDS.filter((c) => (!rarity || c.rarity === rarity) && (!needle || c.name.toLowerCase().includes(needle))).map((c) => c.slug);
}

/** Section heading with the violet gem accent. */
export function GemHeading({ children, as: Tag = "h2", className = "" }: { children: ReactNode; as?: "h1" | "h2" | "h3"; className?: string }) {
  return (
    <Tag className={`flex items-center gap-2 font-semibold ${className}`}>
      <span className="gem" aria-hidden />
      {children}
    </Tag>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8 flex flex-col gap-6">
      <GemHeading as="h1" className="text-2xl sm:text-3xl font-bold">{title}</GemHeading>
      {children}
    </main>
  );
}

export const grid = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4";

export const coins = (n: number) => `🪙 ${n.toLocaleString()}`;

/** searchParams → flash message props */
export async function flashFrom(sp: Promise<Record<string, string | string[] | undefined>>) {
  const p = await sp;
  return { ok: typeof p.ok === "string" ? p.ok : undefined, err: typeof p.err === "string" ? p.err : undefined };
}
