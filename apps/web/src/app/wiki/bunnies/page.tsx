import { ELEMENTS, RARITIES, SETS, VARIANTS } from "@/lib/wiki";

export default function BunniesWikiPage() {
  return (
    <article className="space-y-8">
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

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-meadow-400">Sets</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {SETS.map((s) => (
            <div key={s.id} className="rounded-2xl border border-meadow-700 bg-meadow-900/50 p-4">
              <h3 className="font-display text-lg text-meadow-400">{s.name}</h3>
              <p className="mt-1 text-sm text-meadow-100/65">{s.blurb}</p>
              <p className="mt-2 font-mono text-xs text-meadow-100/40">{s.id}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-meadow-100/65">
          Browse the live catalog on the{" "}
          <a href="/cards" className="text-meadow-400 underline">
            Cards
          </a>{" "}
          page, or use <code className="text-meadow-400">bd card &lt;name&gt;</code> in Discord.
        </p>
      </section>
    </article>
  );
}
