import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD_BY_SLUG } from "@/game/data/cards";
import { BURROW_RATE, LEVEL_CAP, RARITY_EMOJI } from "@/game/config";
import { cardStats } from "@/game/rules";
import { connectDb } from "@/game/db";
import { searchListings } from "@/game/services/market";
import { RARITY_TEXT, coins } from "../../components";
import CardStage from "../../CardStage";

export default async function CardDetail({ params }: PageProps<"/cards/[slug]">) {
  const { slug } = await params;
  const def = CARD_BY_SLUG.get(slug);
  if (!def) notFound();
  await connectDb();
  const listings = await searchListings({ slug, limit: 5 });
  const s1 = cardStats(def, 1);
  const sMax = cardStats(def, LEVEL_CAP[def.rarity]);
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 grid md:grid-cols-[280px_1fr] gap-8">
      <div className="w-full max-w-[280px]">
        <div className="gold-frame"><div className="gold-frame-inner p-2">
        <CardStage slug={slug} name={def.name} rarity={def.rarity} mode="inspect" />
        </div></div>
        <p className="mt-2 text-xs text-plum-400 text-center">
          <span className="[@media(pointer:fine)]:hidden">Drag to turn · tap Flip card</span>
          <span className="hidden [@media(pointer:fine)]:inline">Hover to tilt · drag or ← → to turn · F to flip</span>
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <Link href="/cards" className="text-sm text-plum-400 hover:text-white">← All cards</Link>
        <h1 className={`text-3xl font-bold ${RARITY_TEXT[def.rarity]}`}>{RARITY_EMOJI[def.rarity]} {def.name}</h1>
        <p className="text-plum-400 italic">{def.description}</p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            ["Rarity", def.rarity], ["Element", def.element], ["Set", def.setId],
            ["Stats Lv 1", `⚔️${s1.atk} 🛡️${s1.def} ❤️${s1.hp}`],
            [`Stats Lv ${LEVEL_CAP[def.rarity]} (max)`, `⚔️${sMax.atk} 🛡️${sMax.def} ❤️${sMax.hp}`],
            ["Burrow", `${BURROW_RATE[def.rarity]}/h at Lv 1`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-plum-800 bg-plum-900 p-3"><dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-plum-400"><span className="gem" aria-hidden />{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
          ))}
        </dl>
        {def.abilities?.map((a) => <p key={a.id} className="text-sm"><b>{a.name}:</b> {a.description}</p>)}
        <section>
          <h2 className="font-semibold mb-2">On the market</h2>
          {listings.length ? (
            <ul className="text-sm flex flex-col gap-1">
              {listings.map((l) => <li key={l.code}>{l.variant} · Lv {l.level} · {coins(l.price)} · <Link href="/market" className="text-gold-300">buy</Link></li>)}
            </ul>
          ) : <p className="text-sm text-plum-500">None listed right now.</p>}
        </section>
      </div>
    </main>
  );
}
