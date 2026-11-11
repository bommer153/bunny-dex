import { UserCard } from "@/game/models";
import { spareCards } from "@/game/rules";
import { getUser } from "@/game/services/player";
import { requireUid } from "../lib/session";
import { Page } from "../components";
import CombineLab from "./CombineLab";

export default async function CombinePage() {
  const uid = await requireUid();
  const u = await getUser(uid);
  // Only cards combine() accepts: available and not in the battle deck.
  const mine = await UserCard.find({ ownerId: uid, status: "available", code: { $nin: u.deck } }, { code: 1, slug: 1, variant: 1, level: 1 }).lean();
  const cards = mine.map((c) => ({ code: c.code, slug: c.slug, variant: c.variant, level: c.level }));
  return (
    <Page title="🧪 Combine Lab">
      <CombineLab cards={cards} spare={spareCards(cards).map((c) => c.code)} />
    </Page>
  );
}
