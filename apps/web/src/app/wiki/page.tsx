export default function WikiHomePage() {
  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-meadow-400">BunnyDex Wiki</h1>
        <p className="mt-2 max-w-2xl text-meadow-100/70">
          BunnyDex is a Discord-first collectible card game. Hunt rare bunnies, build decks,
          battle in three lanes, and trade on the marketplace — then manage everything on the web.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {[
          {
            href: "/wiki/getting-started",
            title: "Getting started",
            body: "Invite the bot, run bd start, claim your first flock.",
          },
          {
            href: "/wiki/commands",
            title: "Commands",
            body: "Full bd command reference for Discord.",
          },
          {
            href: "/wiki/bunnies",
            title: "Bunnies & cards",
            body: "Elements, rarities, variants, and sets.",
          },
          {
            href: "/wiki/economy",
            title: "Economy",
            body: "Coins, gems, shop, packs, and gambling limits.",
          },
          {
            href: "/wiki/battle",
            title: "Deck & battle",
            body: "12-card decks and 3-lane clashes.",
          },
          {
            href: "/wiki/social",
            title: "Trade & market",
            body: "Player trades and the coin marketplace.",
          },
        ].map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-meadow-700 bg-meadow-900/60 p-5 transition hover:border-meadow-400"
          >
            <h2 className="font-display text-xl text-meadow-400">{card.title}</h2>
            <p className="mt-2 text-sm text-meadow-100/65">{card.body}</p>
          </a>
        ))}
      </section>

      <section className="rounded-2xl border border-meadow-700/50 bg-meadow-900/40 p-5">
        <h2 className="font-display text-xl text-meadow-400">Core loop</h2>
        <p className="mt-2 text-sm leading-relaxed text-meadow-100/70">
          Earn → Hunt → Collect → Open loot → Upgrade → Build deck → Battle → Trade → Complete
          collections → Achievements
        </p>
      </section>
    </article>
  );
}
