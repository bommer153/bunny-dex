import Link from "next/link";
import { CARDS, RARITIES } from "@/game/data/cards";
import { RARITY_EMOJI, TRAITS } from "@/game/config";
import { completedSets, setTitle } from "@/game/rules";
import { collectionProgress } from "@/game/services/cards";
import { getUid } from "../lib/session";
import { CardTile, Page, gridDense } from "../components";

export default async function CardsPage({ searchParams }: PageProps<"/cards">) {
  const { rarity } = await searchParams;
  const shown = RARITIES.includes(rarity as never) ? CARDS.filter((c) => c.rarity === rarity) : CARDS;
  // Signed in: this page doubles as your Dex (uncaught cards are silhouettes, finished element sets get a gold badge).
  const uid = await getUid();
  const dex = uid ? await collectionProgress(uid) : null;
  const done = new Set(dex ? completedSets(dex.ownedSlugs) : []);
  return (
    <Page title={dex ? `Your Dex ${dex.owned}/${dex.total}` : `Cards (${shown.length})`}>
      {dex && (
        <ul className="flex flex-wrap gap-2 text-sm" aria-label="Element sets">
          {dex.element.map((el) => (
            <li key={el.key} className={`rounded-full border px-3 py-1 ${done.has(el.key) ? "border-gold-400 bg-gold-500/15 text-gold-200" : "border-plum-700 text-plum-300"}`}>
              {TRAITS[el.key].name.split(" ")[0]} {el.key} {el.owned}/{el.total}{done.has(el.key) && ` · 🏅 ${setTitle(el.key)}`}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/cards" className={`rounded-full px-3 py-1 ${!rarity ? "bg-gold-500 text-plum-950" : "bg-plum-800"}`}>All</Link>
        {RARITIES.map((r) => (
          <Link key={r} href={`/cards?rarity=${r}`} className={`rounded-full px-3 py-1 ${rarity === r ? "bg-gold-500 text-plum-950" : "bg-plum-800"}`}>
            {RARITY_EMOJI[r]} {r}
          </Link>
        ))}
      </div>
      <div className={gridDense}>
        {shown.map((c, i) => <CardTile key={c.slug} slug={c.slug} href={`/cards/${c.slug}`} index={i} tilt missing={!!dex && !dex.ownedSlugs.has(c.slug)} />)}
      </div>
    </Page>
  );
}
