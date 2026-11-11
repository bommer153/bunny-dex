import { CARDS } from "@/game/data/cards";
import { CONFIG } from "@/game/config";
import Image from "next/image";
import { CardTile, button, ghostButton, grid, panel } from "./components";

const FEATURED = ["eclipse-empress", "polar-sovereign", "cinder-monarch", "aurora-myth", "meadow-hop"];

const FEATURES = [
  ["🌿 Hunt", "Find wild bunnies every minute. Rarer finds, shiny variants, and a pity timer."],
  ["📚 Collect", `${CARDS.length} bunnies across 7 rarities and 8 variants.`],
  ["🥕 Level up", "Feed duplicates or carrots to your cards. Battles give XP too."],
  ["🕳️ Burrow", "Park bunnies in your burrow and they earn coins while you're away."],
  ["⚔️ Battle", "Build a 3-card deck. Challenge friends or fight a random player."],
  ["🤝 Trade", "Swap cards and coins safely. Both sides confirm."],
  ["🏪 Market", "List cards at a fixed price, or snipe a bargain."],
  ["🔨 Auctions", "Timed bidding with buyouts and anti-snipe extensions."],
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 flex flex-col gap-12">
      <section className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-400"><span className="gem" aria-hidden /> The bunny card game for Discord</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold">Discover. Collect. <span className="text-goldfoil">Battle.</span></h1>
          <p className="text-plum-300 max-w-xl">
            Type <code className="text-gold-200">{CONFIG.prefix} hunt</code> in your server to start, then hunt, combine, battle and trade
            here with the same account.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/profile#hunt" className={`${button} px-5 py-2 text-base`}>🌿 Start hunting</a>
            <a href="/cards" className={`${ghostButton} px-4 py-2`}>Browse cards</a>
            <a href="/guide" className={`${ghostButton} px-4 py-2`}>📖 Guide</a>
          </div>
        </div>
        <div className="gold-frame mx-auto w-64 sm:w-72">
          <div className="gold-frame-inner p-2">
            <Image src="/brand/emblem.webp" alt="BunnyDex mascot holding a card" width={480} height={480} priority className="fx-bob w-full rounded-full" />
          </div>
        </div>
      </section>
      <section className={grid}>
        {FEATURED.map((slug, i) => <CardTile key={slug} slug={slug} href={`/cards/${slug}`} index={i} tilt />)}
      </section>
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map(([title, text]) => (
          <div key={title} className={`${panel} p-4`}>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-plum-400 mt-1">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
