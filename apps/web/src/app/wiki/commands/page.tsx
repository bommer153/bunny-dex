import { COMMAND_GROUPS } from "@/lib/wiki";
import { WikiCardArt } from "@/components/wiki-card-art";

export default function CommandsWikiPage() {
  return (
    <article className="space-y-8">
      <header className="grid gap-6 sm:grid-cols-[160px_1fr] sm:items-center">
        <WikiCardArt slug="meadow-hop" name="Meadow Hop" href="/cards/meadow-hop" />
        <div>
          <h1 className="font-display text-4xl text-meadow-400">Commands</h1>
          <p className="mt-2 text-meadow-100/70">
            All gameplay commands use the prefix <code className="text-meadow-400">bd</code> in
            Discord. Card lookups, hunts, packs, and wiki links include bunny portraits in the
            embed.
          </p>
        </div>
      </header>

      {COMMAND_GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="font-display text-2xl text-meadow-400">{group.title}</h2>
          <div className="overflow-hidden rounded-2xl border border-meadow-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-meadow-900 text-meadow-100/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Command</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {group.commands.map((row) => (
                  <tr key={row.cmd} className="border-t border-meadow-700/70 bg-meadow-950/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-meadow-400">
                      {row.cmd}
                    </td>
                    <td className="px-4 py-3 text-meadow-100/75">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  );
}
