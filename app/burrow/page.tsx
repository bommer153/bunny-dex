import Link from "next/link";
import { CONFIG } from "@/game/config";
import { burrowStatus } from "@/game/services/cards";
import { requireUid } from "../lib/session";
import { burrowRemoveAction } from "../actions";
import { CardTile, Flash, Page, button, flashFrom, ghostButton, grid, panel } from "../components";
import CollectButton from "./CollectButton";

export default async function BurrowPage({ searchParams }: PageProps<"/burrow">) {
  const uid = await requireUid();
  const b = await burrowStatus(uid);
  return (
    <Page title={`🕳️ Burrow (${b.cards.length}/${b.slots})`}>
      {/* Tunnel entrance: pure CSS, opens as soon as the (server-rendered) burrow is painted; hidden for reduced motion. */}
      <div aria-hidden className="fx-tunnel" />
      <Flash {...await flashFrom(searchParams)} />
      <p className="text-plum-400 text-sm">
        Bunnies in your burrow earn coins over time, up to {CONFIG.burrowMaxHours}h of storage. Rarer and higher-level bunnies earn more.
        Add bunnies from your <Link href="/collection" className="text-gold-300">collection</Link>.
      </p>
      <section className={`${panel} relative overflow-hidden p-5`} aria-label="Burrow entrance">
        {/* Softly lit tunnel mouth: warm light at the far end, violet walls. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_50%,rgb(253_230_138/0.22),transparent_35%),repeating-radial-gradient(ellipse_at_85%_50%,rgb(91_42_140/0.18)_0_14px,transparent_14px_30px)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <CollectButton ready={b.pending} className={`${button} px-5 py-2 text-base`} />
          <span className="text-xs text-plum-400">{b.cards.length}/{b.slots} bunnies digging · stores up to {CONFIG.burrowMaxHours}h</span>
        </div>
      </section>
      <div className={grid}>
        {b.cards.map((c, i) => (
          <CardTile key={c.code} slug={c.slug} variant={c.variant} level={c.level} code={c.code} index={i} tilt>
            <div className="text-sm text-emerald-300">+{c.pending} pending</div>
            <form action={burrowRemoveAction}>
              <input type="hidden" name="code" value={c.code} />
              <button className={`${ghostButton} w-full`}>Take out</button>
            </form>
          </CardTile>
        ))}
      </div>
    </Page>
  );
}
