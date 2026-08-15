import { CARD_CATALOG } from "@/lib/wiki";
import { WikiCardStrip } from "@/components/wiki-card-art";

export default function GettingStartedPage() {
  const starters = CARD_CATALOG.filter((c) => c.starter).map((c) => ({
    slug: c.slug,
    name: c.name,
  }));

  return (
    <article className="prose-invert space-y-6">
      <h1 className="font-display text-4xl text-meadow-400">Getting started</h1>

      <ol className="list-decimal space-y-4 pl-5 text-meadow-100/80">
        <li>
          <strong className="text-meadow-100">Invite the bot</strong> to your Discord server from
          the Developer Portal (scopes: <code className="text-meadow-400">bot</code> +{" "}
          <code className="text-meadow-400">applications.commands</code>).
        </li>
        <li>
          Enable <strong className="text-meadow-100">Message Content Intent</strong> on the Bot
          page, then save.
        </li>
        <li>
          Make sure the bot process is online (<code className="text-meadow-400">pnpm bot</code> on
          the host).
        </li>
        <li>
          In any channel the bot can read, type:
          <pre className="mt-2 overflow-x-auto rounded-xl border border-meadow-700 bg-meadow-950 p-3 text-sm text-meadow-400">
            bd start
          </pre>
          You receive starter bunnies and coins. Discord shows each starter portrait on the welcome
          message.
        </li>
        <li>
          Try your first hunt:
          <pre className="mt-2 overflow-x-auto rounded-xl border border-meadow-700 bg-meadow-950 p-3 text-sm text-meadow-400">
            bd hunt
          </pre>
          Card drops attach the bunny image in Discord.
        </li>
        <li>
          Look up any bunny with <code className="text-meadow-400">bd card meadow hop</code> — the
          bot embeds the full card art.
        </li>
        <li>
          Sign in on the web dashboard with Discord to view profile, collection, decks, and the
          marketplace.
        </li>
      </ol>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-meadow-400">Your starter flock</h2>
        <p className="text-sm text-meadow-100/70">
          These four Meadow bunnies are granted on{" "}
          <code className="text-meadow-400">bd start</code>.
        </p>
        <WikiCardStrip slugs={starters} />
      </section>

      <section className="rounded-2xl border border-meadow-700 bg-meadow-900/50 p-5">
        <h2 className="font-display text-xl text-meadow-400">First-hour tips</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-meadow-100/75">
          <li>
            Use <code className="text-meadow-400">bd daily</code> and{" "}
            <code className="text-meadow-400">bd work</code> for early coins.
          </li>
          <li>
            Check <code className="text-meadow-400">bd shop</code> for packs and boosters.
          </li>
          <li>
            Build a 12-card deck before battling — see the Battle wiki page.
          </li>
          <li>
            Hunt has a cooldown; Energy Drink and Lucky Charm change the odds/timing.
          </li>
        </ul>
      </section>
    </article>
  );
}
