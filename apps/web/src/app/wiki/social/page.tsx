import { WikiCardStrip } from "@/components/wiki-card-art";

export default function SocialWikiPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-display text-4xl text-meadow-400">Trade & marketplace</h1>
        <p className="mt-2 text-meadow-100/70">
          Two ways to exchange value: direct player trades, and the public coin market.
        </p>
      </header>

      <WikiCardStrip
        slugs={[
          { slug: "prism-patron", name: "Prism Patron" },
          { slug: "celestine-key", name: "Celestine Key" },
          { slug: "eclipse-empress", name: "Eclipse Empress" },
          { slug: "aurora-myth", name: "Aurora Myth" },
        ]}
      />

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Direct trade</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-meadow-100/75">
          <li>
            <code className="text-meadow-400">bd trade @user</code> opens a trade
          </li>
          <li>Both sides add cards / coins</li>
          <li>Both <code className="text-meadow-400">bd trade confirm</code></li>
          <li>Atomic settle — never partial</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Marketplace</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-meadow-100/75">
          <li>Listing a card locks it (cannot use in decks / trades)</li>
          <li>Buy pays coins; seller receives price minus fee</li>
          <li>Fee defaults to 5% and is configurable</li>
          <li>Cancel or expiry restores the card</li>
        </ul>
        <pre className="overflow-x-auto rounded-xl border border-meadow-700 bg-meadow-950 p-4 text-sm text-meadow-400">
{`bd market sell <userCardId> 500
bd market search bunny
bd market buy <listingId>
bd market mine`}
        </pre>
        <p className="text-sm text-meadow-100/65">
          Web UI:{" "}
          <a href="/marketplace" className="text-meadow-400 underline">
            Marketplace
          </a>
        </p>
      </section>
    </article>
  );
}
