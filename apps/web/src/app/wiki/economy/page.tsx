import { WikiCardArt } from "@/components/wiki-card-art";

const PACKS = [
  {
    slug: "standard",
    name: "Standard pack",
    cost: "250 coins · 5 cards",
    art: "meadow-hop",
    artName: "Meadow Hop",
  },
  {
    slug: "fire",
    name: "Ember pack",
    cost: "300 coins · Ember set",
    art: "ember-puff",
    artName: "Ember Puff",
  },
  {
    slug: "tide",
    name: "Tide pack",
    cost: "300 coins · Tide Hollow",
    art: "tide-tuft",
    artName: "Tide Tuft",
  },
  {
    slug: "nightveil",
    name: "Nightveil pack",
    cost: "320 coins · Nightveil",
    art: "dusk-dart",
    artName: "Dusk Dart",
  },
  {
    slug: "legendary",
    name: "Legendary pack",
    cost: "10 gems · high rarities",
    art: "eclipse-empress",
    artName: "Eclipse Empress",
  },
];

export default function EconomyWikiPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-display text-4xl text-meadow-400">Economy</h1>
        <p className="mt-2 text-meadow-100/70">
          BunnyDex uses soft currencies only. There is no real-money gambling.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { name: "Coins", symbol: "🪙", use: "Shop, packs, market, gambles, NPC sells" },
          { name: "Gems", symbol: "💎", use: "Premium packs and scarce rewards" },
          { name: "Tickets", symbol: "🎟️", use: "Pack / entry tokens" },
        ].map((c) => (
          <div key={c.name} className="rounded-2xl border border-meadow-700 bg-meadow-900/50 p-4">
            <div className="text-2xl">{c.symbol}</div>
            <h2 className="mt-2 font-display text-xl text-meadow-400">{c.name}</h2>
            <p className="mt-1 text-sm text-meadow-100/65">{c.use}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl text-meadow-400">Earn coins</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-meadow-100/75">
          <li>Hunt, daily, work</li>
          <li>Battles (win pays more than loss)</li>
          <li>Quests and achievements</li>
          <li>Selling cards to NPC or marketplace</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl text-meadow-400">Spend coins</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-meadow-100/75">
          <li>Shop items, loot boxes, pack tickets</li>
          <li>Pack openings</li>
          <li>Marketplace purchases (seller fee sinks coins)</li>
          <li>In-game gambling (limits + cooldowns apply)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Items</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            { name: "Lucky Charm", desc: "+10% rare chance for 10 hunts." },
            { name: "Hunter's Lens", desc: "+15% special variant chance for 8 hunts." },
            { name: "Energy Drink", desc: "Reduces next hunt cooldown by 30 seconds." },
            { name: "Mystery Loot Box", desc: "Random coins, items, or cards." },
            { name: "Legendary Loot Box", desc: "High-tier coins, gems, and rare cards." },
            { name: "Pack Ticket", desc: "Redeemable toward a standard pack." },
          ].map((item) => (
            <li
              key={item.name}
              className="rounded-xl border border-meadow-700 bg-meadow-900/40 px-4 py-3"
            >
              <div className="font-medium text-meadow-400">{item.name}</div>
              <p className="text-sm text-meadow-100/65">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Packs</h2>
        <p className="text-sm text-meadow-100/65">
          Opening a pack in Discord (<code className="text-meadow-400">bd pack open &lt;slug&gt;</code>
          ) shows each pulled bunny as a gallery of card images.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PACKS.map((pack) => (
            <div key={pack.slug} className="space-y-2">
              <WikiCardArt
                slug={pack.art}
                name={pack.artName}
                href={`/cards/${pack.art}`}
                caption={pack.name}
              />
              <p className="text-center text-xs text-meadow-100/60">
                <code className="text-meadow-400">{pack.slug}</code>
                <br />
                {pack.cost}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-meadow-700 bg-meadow-900/50 p-5">
        <h2 className="font-display text-xl text-meadow-400">Safeguards</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-meadow-100/75">
          <li>All balance changes go through EconomyService + ledger</li>
          <li>Marketplace fee defaults to 5% (configurable)</li>
          <li>Gambling: min/max bet, cooldown, daily wager cap</li>
          <li>Server-side RNG for loot, packs, boxes, and battles</li>
        </ul>
      </section>
    </article>
  );
}
