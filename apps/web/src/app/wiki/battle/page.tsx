export default function BattleWikiPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-display text-4xl text-meadow-400">Deck & battle</h1>
        <p className="mt-2 text-meadow-100/70">
          MVP battles are fast 3-lane clashes — not a full turn-based TCG yet.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Deck rules</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-meadow-100/75">
          <li>Exactly <strong className="text-meadow-100">12 cards</strong></li>
          <li>Max <strong className="text-meadow-100">3 copies</strong> of the same card definition</li>
          <li>Only <code className="text-meadow-400">available</code> cards (not listed / in trade)</li>
          <li>
            Set active with <code className="text-meadow-400">bd deck use &lt;name&gt;</code>
          </li>
        </ul>
        <pre className="overflow-x-auto rounded-xl border border-meadow-700 bg-meadow-950 p-4 text-sm text-meadow-400">
{`bd deck create Fire
bd cards
bd deck add Fire <userCardId>
bd deck use Fire`}
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">How a battle works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-meadow-100/75">
          <li>Each side picks 3 cards from the active deck (seeded shuffle).</li>
          <li>Three lanes resolve at once using ATK / DEF / HP + element advantage.</li>
          <li>Majority of lanes wins the match (draws possible).</li>
          <li>Rating and coin/XP rewards are applied server-side.</li>
        </ol>
        <pre className="overflow-x-auto rounded-xl border border-meadow-700 bg-meadow-950 p-4 text-sm text-meadow-400">
{`bd battle random
bd battle @friend
bd battle history`}
        </pre>
      </section>

      <section className="rounded-2xl border border-meadow-700 bg-meadow-900/50 p-5 text-sm text-meadow-100/75">
        You can also manage decks on the{" "}
        <a href="/deck" className="text-meadow-400 underline">
          Deck
        </a>{" "}
        page after Discord login.
      </section>
    </article>
  );
}
