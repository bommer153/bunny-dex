import Link from "next/link";
import { RARITIES, type Rarity } from "@/game/data/cards";
import { RARITY_EMOJI } from "@/game/config";
import { collectionProgress, listCards } from "@/game/services/cards";
import { requireUid } from "../lib/session";
import { auctionStartAction, burrowAddAction, feedCarrotAction, marketSellAction, npcSellAction } from "../actions";
import { CardTile, Flash, Page, button, flashFrom, ghostButton, grid, input, matchSlugs, panel } from "../components";
import { Stamp } from "../fx/Burst";

export default async function CollectionPage({ searchParams }: PageProps<"/collection">) {
  const uid = await requireUid();
  const sp = await searchParams;
  const rarity = RARITIES.find((r) => r === sp.rarity) as Rarity | undefined;
  const page = Number(sp.page) || 1;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const slugs = matchSlugs(q, rarity);
  const [res, prog] = await Promise.all([listCards(uid, { rarity, slugs, page, perPage: 20 }), collectionProgress(uid)]);
  const link = (p: number, r = rarity) => `/collection?${new URLSearchParams({ ...(r && { rarity: r }), ...(q && { q }), page: String(p) })}`;

  return (
    <Page title={`Collection · Dex ${prog.owned}/${prog.total}`}>
      <Flash {...await flashFrom(searchParams)} />
      {sp.fx === "sell" && <Stamp key={String(sp.t)} text="Sold!" />}
      <form action="/collection" role="search" className="flex flex-wrap gap-2">
        {rarity && <input type="hidden" name="rarity" value={rarity} />}
        <label className="sr-only" htmlFor="col-q">Search your cards</label>
        <input id="col-q" name="q" defaultValue={q} placeholder="Search your cards…" className={`${input} max-w-xs py-1.5`} />
        <button className={`${button} py-1.5`}>Search</button>
        {q && <Link href={link(1)} className={`${ghostButton} py-1.5`}>Clear</Link>}
      </form>
      <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="Filter by rarity">
        <Link href={q ? `/collection?q=${encodeURIComponent(q)}` : "/collection"} aria-current={!rarity ? "page" : undefined} className={`rounded-full px-3 py-1 ${!rarity ? "bg-gold-500 text-plum-950 font-semibold" : "bg-plum-800"}`}>{!rarity && "◆ "}All</Link>
        {prog.rarity.map((r) => (
          <Link key={r.key} href={link(1, r.key)} aria-current={rarity === r.key ? "page" : undefined} className={`rounded-full px-3 py-1 ${rarity === r.key ? "bg-gold-500 text-plum-950 font-semibold" : "bg-plum-800"}`}>
            {RARITY_EMOJI[r.key]} {r.key} <span className="tabular-nums">{r.owned}/{r.total}</span>
          </Link>
        ))}
      </div>
      <Link href="/combine" className={`${panel} p-4 hover:border-gold-500/50 flex items-center justify-between gap-3`}>
        <span><strong>🧪 Combine Lab</strong> <span className="text-sm text-plum-400">· merge 3 cards of one rarity for a chance at the next rarity</span></span>
        <span aria-hidden>→</span>
      </Link>
      {res.cards.length === 0 && <p className="text-plum-500">{q ? `No cards match “${q}”.` : "No cards here. Go hunting!"}</p>}
      <div className={grid}>
        {res.cards.map((c, i) => (
          <CardTile key={c.code} slug={c.slug} variant={c.variant} level={c.level} code={c.code} status={c.status} index={i} tilt preview>
            {c.status === "available" && (
              <details className="text-sm">
                <summary className="cursor-pointer text-plum-400 hover:text-white">Actions</summary>
                <div className="flex flex-col gap-2 mt-2">
                  <form action={feedCarrotAction} className="flex gap-1">
                    <input type="hidden" name="code" value={c.code} />
                    <select name="item" aria-label="Carrot type" className={input}>
                      <option value="carrot">🥕 Carrot</option>
                      <option value="golden-carrot">✨ Golden</option>
                    </select>
                    <input name="qty" type="number" min={1} defaultValue={1} aria-label="Quantity" className={`${input} max-w-14`} />
                    <button className={ghostButton}>Feed</button>
                  </form>
                  <form action={burrowAddAction}>
                    <input type="hidden" name="code" value={c.code} />
                    <button className={`${ghostButton} w-full`}>🕳️ Send to burrow</button>
                  </form>
                  <form action={marketSellAction} className="flex gap-1">
                    <input type="hidden" name="code" value={c.code} />
                    <input name="price" type="number" min={1} required placeholder="Price" aria-label="Price" className={input} />
                    <button className={ghostButton}>Sell</button>
                  </form>
                  <form action={auctionStartAction} className="grid grid-cols-2 gap-1">
                    <input type="hidden" name="code" value={c.code} />
                    <input name="minBid" type="number" min={1} required placeholder="Min bid" aria-label="Minimum bid" className={input} />
                    <input name="duration" required placeholder="Time (6h)" aria-label="Duration, e.g. 30m, 6h, 2d" className={input} />
                    <input name="buyout" type="number" min={1} placeholder="Buyout (opt.)" aria-label="Buyout (optional)" className={input} />
                    <button className={button}>Auction</button>
                  </form>
                  <form action={npcSellAction}>
                    <input type="hidden" name="code" value={c.code} />
                    <button className={`${ghostButton} w-full text-red-300`}>💰 Sell to shop (destroys card)</button>
                  </form>
                </div>
              </details>
            )}
          </CardTile>
        ))}
      </div>
      {res.pages > 1 && (
        <nav className="flex items-center gap-3" aria-label="Pages">
          {res.page > 1 && <Link className={ghostButton} href={link(res.page - 1)}>◀ Prev</Link>}
          <span className="text-sm text-plum-400">Page {res.page} / {res.pages}</span>
          {res.page < res.pages && <Link className={ghostButton} href={link(res.page + 1)}>Next ▶</Link>}
        </nav>
      )}
    </Page>
  );
}
