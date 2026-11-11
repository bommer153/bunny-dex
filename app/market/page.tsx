import { CONFIG } from "@/game/config";
import { RARITIES } from "@/game/data/cards";
import { searchListings, usernames } from "@/game/services/market";
import { getUid } from "../lib/session";
import { marketBuyAction, marketCancelAction } from "../actions";
import { CardTile, FilterBar, Flash, Page, button, coins, flashFrom, ghostButton, grid, matchSlugs } from "../components";
import { Stamp } from "../fx/Burst";
import { SubmitButton } from "../SubmitButton";

const SORTS: [string, string][] = [["price", "Cheapest first"], ["-price", "Priciest first"], ["new", "Newest"]];

export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const uid = await getUid();
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const q = str(sp.q), rarity = RARITIES.find((r) => r === sp.rarity), sort = SORTS.find(([v]) => v === sp.sort)?.[0] as "price" | "-price" | "new" | undefined;
  const slugs = matchSlugs(q, rarity);
  const listings = slugs?.length === 0 ? [] : await searchListings({ limit: 60, slugs, sort });
  const names = await usernames(listings.map((l) => l.sellerId));
  return (
    <Page title="🏪 Market">
      <Flash {...await flashFrom(searchParams)} />
      {sp.fx === "buy" && <Stamp key={String(sp.t)} text="Purchased!" tone="gold" />}
      <FilterBar action="/market" q={q} rarity={rarity} sort={sort} sorts={SORTS} />
      <p className="text-sm text-plum-400">
        {listings.length} listing{listings.length === 1 ? "" : "s"}{q || rarity ? " match" : ""}. Sellers pay a {Math.round(CONFIG.marketFee * 100)}% fee. List a card from your collection or with{" "}
        <code className="text-gold-200">bd market sell &lt;code&gt; &lt;price&gt;</code>.
      </p>
      {listings.length === 0 && <p className="text-plum-500">{q || rarity ? "No listings match. Try another search." : "Nothing listed right now."}</p>}
      <div className={grid}>
        {listings.map((l, i) => (
          <CardTile key={l.code} slug={l.slug} variant={l.variant} level={l.level} index={i} tilt>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold text-gold-300 tabular-nums">{coins(l.price)}</span>
              <code className="text-xs text-plum-500">{l.code}</code>
            </div>
            <div className="text-xs text-plum-400">by {names.get(l.sellerId) ?? "?"}{uid === l.sellerId && " (you)"}</div>
            {uid === l.sellerId ? (
              <form action={marketCancelAction}><input type="hidden" name="code" value={l.code} /><button className={`${ghostButton} w-full`}>Cancel listing</button></form>
            ) : (
              <form action={marketBuyAction}><input type="hidden" name="code" value={l.code} /><SubmitButton className={`${button} w-full py-1.5`} pending="Buying…">{uid ? `Buy · ${l.price.toLocaleString()} 🪙` : "Sign in to buy"}</SubmitButton></form>
            )}
          </CardTile>
        ))}
      </div>
    </Page>
  );
}
