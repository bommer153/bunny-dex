import { Trade, UserCard } from "@/game/models";
import { usernames } from "@/game/services/market";
import { requireUid } from "../lib/session";
import { tradeAcceptAction, tradeAddCardAction, tradeCancelAction, tradeCoinsAction, tradeConfirmAction } from "../actions";
import { CardTile, Flash, Page, button, coins, flashFrom, ghostButton, input } from "../components";
import { getCard } from "@/game/data/cards";

export default async function TradesPage({ searchParams }: PageProps<"/trades">) {
  const uid = await requireUid();
  const t = await Trade.findOne({ $or: [{ fromId: uid }, { toId: uid }], status: { $in: ["pending", "open"] }, expiresAt: { $gt: new Date() } }).lean();
  if (!t) {
    return (
      <Page title="🤝 Trades">
        <Flash {...await flashFrom(searchParams)} />
        <p className="text-plum-400">No open trade. Start one in Discord with <code>bd trade @user</code>, then manage it here or with the buttons in Discord.</p>
      </Page>
    );
  }
  const [names, offered, mine] = await Promise.all([
    usernames([t.fromId, t.toId]),
    UserCard.find({ code: { $in: [...t.from!.cards, ...t.to!.cards] } }).lean(),
    UserCard.find({ ownerId: uid, status: "available" }).sort({ level: -1 }).limit(100).lean(),
  ]);
  const meSide = t.fromId === uid ? "from" : "to";
  const sides = [
    { id: t.fromId, o: t.from! },
    { id: t.toId, o: t.to! },
  ];
  return (
    <Page title={`🤝 Trade ${t.code}`}>
      <Flash {...await flashFrom(searchParams)} />
      <p className="text-sm text-plum-400">
        Expires {t.expiresAt.toLocaleTimeString()}. Any change resets both confirmations, so nothing changes after you confirm.
      </p>
      {t.status === "pending" && (
        t.toId === uid ? (
          <form action={tradeAcceptAction}><input type="hidden" name="code" value={t.code} /><button className={button}>Accept trade request</button></form>
        ) : <p className="text-plum-400">Waiting for {names.get(t.toId)} to accept.</p>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        {sides.map(({ id, o }) => (
          <section key={id} className="rounded-xl bg-plum-900 p-4 flex flex-col gap-3">
            <h2 className="font-semibold">{o.confirmed ? "✅" : "⏳"} {names.get(id) ?? id}{id === uid && " (you)"}</h2>
            <div className="text-lg">{coins(o.coins)}</div>
            <div className="grid grid-cols-2 gap-3">
              {offered.filter((c) => o.cards.includes(c.code)).map((c) => <CardTile key={c.code} slug={c.slug} variant={c.variant} level={c.level} code={c.code} />)}
            </div>
          </section>
        ))}
      </div>
      {t.status === "open" && (
        <section className="flex flex-col gap-3 max-w-xl">
          <form action={tradeAddCardAction} className="flex gap-2">
            <select name="card" required aria-label="Card to offer" className={input}>
              {mine.map((c) => <option key={c.code} value={c.code}>{getCard(c.slug).name} Lv{c.level} {c.variant !== "normal" ? `(${c.variant})` : ""} · {c.code}</option>)}
            </select>
            <button className={ghostButton}>Add card</button>
          </form>
          <form action={tradeCoinsAction} className="flex gap-2">
            <input name="coins" type="number" min={0} defaultValue={t[meSide]!.coins} aria-label="Coins to offer" className={input} />
            <button className={ghostButton}>Set coins</button>
          </form>
          <div className="flex gap-2">
            <form action={tradeConfirmAction}><input type="hidden" name="code" value={t.code} /><button className={button} disabled={t[meSide]!.confirmed}>Confirm</button></form>
            <form action={tradeCancelAction}><input type="hidden" name="code" value={t.code} /><button className={ghostButton}>Cancel trade</button></form>
          </div>
        </section>
      )}
    </Page>
  );
}
