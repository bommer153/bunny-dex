import { UserCard } from "@/game/models";
import { getCard } from "@/game/data/cards";
import { COMBINE_CHANCE, COMBINE_COUNT, RARITY_EMOJI } from "@/game/config";
import { spareCards } from "@/game/rules";
import { getUser } from "@/game/services/player";
import { BULK_RARITIES } from "@/game/services/cards";
import { requireUid } from "../lib/session";
import { combineAllAction } from "../actions";
import { Flash, Page, flashFrom, ghostButton, panel } from "../components";
import CombineLab from "./CombineLab";

export default async function CombinePage({ searchParams }: PageProps<"/combine">) {
  const uid = await requireUid();
  const u = await getUser(uid);
  // Only cards combine() accepts: available and not in the battle deck.
  const mine = await UserCard.find({ ownerId: uid, status: "available", locked: { $ne: true }, code: { $nin: u.deck } }, { code: 1, slug: 1, variant: 1, level: 1 }).lean();
  const cards = mine.map((c) => ({ code: c.code, slug: c.slug, variant: c.variant, level: c.level }));
  const spare = spareCards(cards);
  const bulk = BULK_RARITIES.map((r) => ({ r, n: spare.filter((c) => getCard(c.slug).rarity === r).length })).filter((b) => b.n >= COMBINE_COUNT);
  const sp = await searchParams;
  return (
    <Page title="🧪 Combine Lab">
      <Flash {...await flashFrom(searchParams)} />
      {bulk.length > 0 && (
        <details className={`${panel} p-4`}>
          <summary className="cursor-pointer font-semibold">🧪 Combine all by rarity <span className="text-sm font-normal text-plum-400">· spares only</span></summary>
          <p className="mt-2 text-sm text-plum-400">Burns every spare duplicate of a rarity, {COMBINE_COUNT} at a time. Your best copy of each bunny, locked cards and your deck are never used.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {bulk.map(({ r, n }) => (
              <form key={r} action={combineAllAction}>
                <input type="hidden" name="rarity" value={r} />
                <button className={ghostButton}>{RARITY_EMOJI[r]} All {r} ×{n} <span className="text-plum-400">({Math.round(COMBINE_CHANCE[r] * 100)}% each)</span></button>
              </form>
            ))}
          </div>
        </details>
      )}
      {/* key: a bulk combine consumes cards, so reset slots that may hold them */}
      <CombineLab key={String(sp.t)} cards={cards} spare={spare.map((c) => c.code)} />
    </Page>
  );
}
