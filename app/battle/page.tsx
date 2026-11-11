import { CONFIG } from "@/game/config";
import { cardStats } from "@/game/rules";
import { getUser, getEnergy } from "@/game/services/player";
import { getTeam, listCards } from "@/game/services/cards";
import { requireUid } from "../lib/session";
import { getCard } from "@/game/data/cards";
import { Flash, Page, button, flashFrom, ghostButton } from "../components";
import BattleScene from "./BattleScene";
import DeckPicker from "./DeckPicker";

export default async function BattlePage({ searchParams }: PageProps<"/battle">) {
  const uid = await requireUid();
  const [u, team, en, all] = await Promise.all([getUser(uid), getTeam(uid), getEnergy(uid), listCards(uid, { perPage: 200 })]);

  return (
    <Page title="⚔️ Battle">
      <Flash {...await flashFrom(searchParams)} />
      <p className="text-sm text-plum-400">
        Your team fights a random player&apos;s deck, one card per lane. Winner gets {CONFIG.battleWinCoins} coins, loser {CONFIG.battleLossCoins}, and your deck cards gain XP.
        To challenge a friend, use <code className="text-gold-200">{CONFIG.prefix} battle</code> in Discord.
        {!u.deck.length && ` No deck set, so your ${CONFIG.teamSize} strongest cards fight.`}
      </p>
      <BattleScene
        team={team.map((t) => ({ code: t.code, slug: t.def.slug, name: t.def.name, rarity: t.def.rarity, level: t.level, variant: t.variant, ...cardStats(t.def, t.level) }))}
        energy={en.energy}
        cost={CONFIG.energyCost.battle}
      />

      <DeckPicker
        key={u.deck.join()}
        deck={u.deck}
        size={CONFIG.teamSize}
        button={button}
        ghostButton={ghostButton}
        cards={all.cards.map((c) => {
          const def = getCard(c.slug);
          const s = cardStats(def, c.level);
          return { code: c.code, slug: c.slug, name: def.name, rarity: def.rarity, variant: c.variant, level: c.level, stats: `Lv ${c.level} · ⚔️${s.atk} 🛡️${s.def} ❤️${s.hp} · ${def.element}` };
        })}
      />
    </Page>
  );
}
