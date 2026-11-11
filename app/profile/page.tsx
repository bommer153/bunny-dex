import { CONFIG, ITEMS, itemInfo } from "@/game/config";
import { auctionSlots, burrowSlots, energyWaitMs, formatDuration } from "@/game/rules";
import { getEnergy, profile, shopLimitsLeft } from "@/game/services/player";
import { requireUid } from "../lib/session";
import { SubmitButton } from "../SubmitButton";
import { buyItemAction, dailyAction, useItemAction } from "../actions";
import HuntScene from "./HuntScene";
import WorkButton from "./WorkButton";
import { Flash, Page, button, coins, flashFrom, ghostButton, input, panel } from "../components";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const uid = await requireUid();
  const [p, en, shop] = await Promise.all([profile(uid), getEnergy(uid), shopLimitsLeft(uid)]);
  const u = p.user;
  const items = [...(u.items?.entries() ?? [])].filter(([, n]) => n > 0);
  // eslint-disable-next-line react-hooks/purity -- Server Component: one clock read per request for the daily timer.
  const dailyLeft = u.lastDaily ? u.lastDaily.getTime() + CONFIG.dailyCooldownMs - Date.now() : 0;
  const workCost = CONFIG.energyCost.work;
  return (
    <Page title={u.username || "Profile"}>
      <Flash {...await flashFrom(searchParams)} />
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Stats">
        {[
          ["Dex", `${p.collected}/${p.total}`, `${p.cards} cards owned`],
          ["Battles", `${u.stats?.battlesWon ?? 0}W / ${u.stats?.battlesLost ?? 0}L`, `${u.stats?.hunts ?? 0} hunts`],
          ["Burrow slots", `${burrowSlots(u.level, u.extraBurrowSlots)}`, "earn while away"],
          ["Auction slots", `${auctionSlots(u.level)}`, "+1 every 10 levels"],
        ].map(([k, v, sub]) => (
          <div key={k} className={`${panel} p-3`}>
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-plum-400"><span className="gem" aria-hidden /> {k}</div>
            <div className="text-xl font-semibold">{v}</div>
            <div className="text-xs text-plum-500">{sub}</div>
          </div>
        ))}
      </section>

      <HuntScene energy={en.energy} max={en.max} cost={CONFIG.energyCost.hunt} nextInMs={en.nextInMs} />

      <div className="grid gap-4 md:grid-cols-2">
        <section id="work" className={`${panel} p-4 flex flex-col gap-3`} aria-labelledby="work-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="work-title" className="flex items-center gap-2 font-semibold"><span className="gem" aria-hidden /> 💼 Work</h2>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs ${en.energy >= workCost ? "border-gold-500/50 text-gold-200" : "border-red-400/50 text-red-300"}`}>
              {en.energy >= workCost ? `✓ Ready · costs ⚡${workCost}` : `✕ Need ⚡${workCost} · ready in ${formatDuration(energyWaitMs(en, workCost))}`}
            </span>
          </div>
          <p className="text-sm text-plum-300">🥕 Tend the carrot fields. Pays <strong className="text-gold-300">{CONFIG.workMin}–{CONFIG.workMax} 🪙</strong> and 5 XP.</p>
          <WorkButton energy={en.energy} cost={workCost} className={button} />
        </section>
        <section id="daily" className={`${panel} p-4 flex flex-col gap-3`} aria-labelledby="daily-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="daily-title" className="flex items-center gap-2 font-semibold"><span className="gem" aria-hidden /> 📅 Daily</h2>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs ${dailyLeft <= 0 ? "border-gold-500/50 text-gold-200" : "border-plum-600 text-plum-400"}`}>
              {dailyLeft <= 0 ? "✓ Ready" : `⏳ Next in ${formatDuration(dailyLeft)}`}
            </span>
          </div>
          <p className="text-sm text-plum-300">{CONFIG.dailyCoins} 🪙, 2 🥕 carrots and a full ⚡ energy bar.</p>
          <form action={dailyAction}>
            <SubmitButton className={button} pending="Claiming…" disabled={dailyLeft > 0}>{dailyLeft > 0 ? `Come back in ${formatDuration(dailyLeft)}` : "📅 Claim daily"}</SubmitButton>
          </form>
        </section>
      </div>

      <section className="grid md:grid-cols-2 gap-6">
        <div className={`${panel} p-4`}>
          <h2 className="font-semibold mb-3">🎒 Inventory</h2>
          {items.length ? (
            <ul className="flex flex-col gap-2">
              {items.map(([slug, n]) => (
                <li key={slug} className="flex items-center justify-between gap-2">
                  <span>{itemInfo(slug)?.name ?? slug} ×{n}</span>
                  {(slug === "clover" || slug === "burrow-key" || slug === "juice") && (
                    <form action={useItemAction}><input type="hidden" name="item" value={slug} /><button className={ghostButton}>Use</button></form>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-plum-500">Empty.</p>}
          {u.cloverHunts > 0 && <p className="text-sm text-green-400 mt-2">🍀 Clover active for {u.cloverHunts} hunts</p>}
          <p className="text-xs text-plum-500 mt-3">Feed carrots to cards on the Collection page.</p>
        </div>
        <div className={`${panel} p-4`}>
          <h2 className="font-semibold mb-3">🛒 Shop</h2>
          <ul className="flex flex-col gap-3">
            {ITEMS.map((i) => (
              <li key={i.slug}>
                <form action={buyItemAction} className="flex items-center gap-2">
                  <input type="hidden" name="item" value={i.slug} />
                  <div className="flex-1">
                    <div>{i.name} · {coins(i.price)}{i.dailyLimit && <span className="text-amber-300"> · {shop.left[i.slug]}/{i.dailyLimit} left today</span>}</div>
                    <div className="text-xs text-plum-500">{i.description}</div>
                  </div>
                  <label className="sr-only" htmlFor={`qty-${i.slug}`}>Quantity</label>
                  <input id={`qty-${i.slug}`} name="qty" type="number" min={1} max={i.dailyLimit ? Math.max(1, shop.left[i.slug]) : 100} defaultValue={1} className={`${input} max-w-16`} />
                  <button className={button} disabled={!!i.dailyLimit && shop.left[i.slug] <= 0}>Buy</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Page>
  );
}
