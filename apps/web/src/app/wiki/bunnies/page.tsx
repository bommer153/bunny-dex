import { CARD_CATALOG, ELEMENTS, RARITIES, SETS, VARIANTS } from "@/lib/wiki";

export default function BunniesWikiPage() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="font-display text-4xl text-meadow-400">Bunnies & cards</h1>
        <p className="mt-2 max-w-2xl text-meadow-100/70">
          Cards are the heart of BunnyDex. Each bunny has an element, rarity, stats (ATK / DEF /
          HP), and optional abilities. Ownership is tracked per instance — you can own multiple
          copies with different variants.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Elements</h2>
        <p className="text-sm text-meadow-100/65">
          In battle, element advantage grants a score bonus when your bunny beats the opposing
          element.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {ELEMENTS.map((el) => (
            <div
              key={el.id}
              className="rounded-xl border border-meadow-700 bg-meadow-900/50 px-4 py-3"
            >
              <div className="font-medium capitalize text-meadow-400">{el.id}</div>
              <div className="text-sm text-meadow-100/70">
                Beats <span className="capitalize">{el.beats}</span> · {el.note}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Rarities</h2>
        <div className="flex flex-wrap gap-2">
          {RARITIES.map((r) => (
            <span
              key={r}
              className="rounded-full border border-meadow-700 bg-meadow-950 px-3 py-1 text-sm capitalize text-meadow-100/80"
            >
              {r}
            </span>
          ))}
        </div>
        <p className="text-sm text-meadow-100/65">
          Higher rarities are harder to hunt and usually worth more — but market price also follows
          demand, battle usefulness, and limited releases.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Variants</h2>
        <p className="text-sm text-meadow-100/65">
          Variants are mostly cosmetic / economic. They do not make a bunny stronger in MVP battles.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {VARIANTS.map((v) => (
            <li
              key={v.id}
              className="rounded-xl border border-meadow-700/80 bg-meadow-900/40 px-4 py-3 text-sm"
            >
              <span className="font-medium capitalize text-meadow-400">{v.id}</span>
              <span className="text-meadow-100/60"> — {v.note}</span>
            </li>
          ))}
        </ul>
      </section>

      {SETS.map((set) => {
        const cards = CARD_CATALOG.filter((c) => c.setId === set.id);
        return (
          <section key={set.id} className="space-y-4">
            <div>
              <h2 className="font-display text-2xl text-meadow-400">{set.name}</h2>
              <p className="text-sm text-meadow-100/65">
                {set.blurb} · {cards.length} cards
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <a
                  key={card.slug}
                  href={`/cards/${card.slug}`}
                  className="overflow-hidden rounded-2xl border border-meadow-700 bg-meadow-900/50 transition hover:border-meadow-400"
                >
                  <div className="aspect-square bg-meadow-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/cards/${card.slug}.png`}
                      alt={card.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg text-meadow-400">{card.name}</h3>
                      {card.starter ? (
                        <span className="rounded-full border border-meadow-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-meadow-400">
                          Starter
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs capitalize text-meadow-100/55">
                      {card.rarity} · {card.element}
                    </p>
                    <p className="text-sm text-meadow-100/70">{card.description}</p>
                    <p className="text-xs text-meadow-100/50">
                      ATK {card.atk} · DEF {card.def} · HP {card.hp}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </article>
  );
}
