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
