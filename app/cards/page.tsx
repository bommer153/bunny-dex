import { CARDS, RARITIES } from "@/game/data/cards";
import { RARITY_EMOJI } from "@/game/config";
import { CardTile, Page, grid } from "../components";

export default async function CardsPage({ searchParams }: PageProps<"/cards">) {
  const { rarity } = await searchParams;
  const shown = RARITIES.includes(rarity as never) ? CARDS.filter((c) => c.rarity === rarity) : CARDS;
  return (
    <Page title={`Cards (${shown.length})`}>
      <div className="flex flex-wrap gap-2 text-sm">
        <a href="/cards" className={`rounded-full px-3 py-1 ${!rarity ? "bg-gold-500 text-plum-950" : "bg-plum-800"}`}>All</a>
        {RARITIES.map((r) => (
          <a key={r} href={`/cards?rarity=${r}`} className={`rounded-full px-3 py-1 ${rarity === r ? "bg-gold-500 text-plum-950" : "bg-plum-800"}`}>
            {RARITY_EMOJI[r]} {r}
          </a>
        ))}
      </div>
      <div className={grid}>
        {shown.map((c, i) => <CardTile key={c.slug} slug={c.slug} href={`/cards/${c.slug}`} index={i} tilt />)}
      </div>
    </Page>
  );
}
