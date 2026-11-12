import Link from "next/link";
import { CONFIG } from "@/game/config";
import { GameError } from "@/game/errors";
import { getEnergy, getUser } from "@/game/services/player";
import { burrowStatus } from "@/game/services/cards";
import { questBoard } from "@/game/services/quests";
import { getUid } from "./lib/session";
import { panel } from "./components";

const Bar = ({ n, max }: { n: number; max: number }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-plum-800" role="presentation">
    <span className="block h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${Math.min(100, (n / Math.max(1, max)) * 100)}%` }} />
  </span>
);

/** "Today" panel for signed-in players: what's waiting right now. Renders nothing for visitors or players who haven't started. */
export default async function Today() {
  const uid = await getUid();
  if (!uid) return null;
  let data;
  try {
    data = await Promise.all([getUser(uid), getEnergy(uid), burrowStatus(uid), questBoard(uid)]);
  } catch (e) {
    if (e instanceof GameError) return null; // signed in but never played
    throw e;
  }
  const [u, en, b, q] = data;
  // eslint-disable-next-line react-hooks/purity -- Server Component: one clock read per request.
  const dailyReady = !u.lastDaily || Date.now() - u.lastDaily.getTime() >= CONFIG.dailyCooldownMs;
  const tiles = [
    { title: "📅 Daily", body: dailyReady ? "Ready to claim!" : `🔥 ${u.streak ?? 0}-day streak`, href: "/profile#daily", hot: dailyReady },
    { title: "⚡ Energy", body: `${en.energy}/${en.max}`, bar: [en.energy, en.max], href: "/profile#hunt", hot: en.energy >= en.max },
    { title: "🕳️ Burrow", body: b.pending ? `🪙 ${b.pending.toLocaleString()} waiting` : `${b.cards.length}/${b.slots} bunnies digging`, href: "/burrow", hot: b.pending > 0 },
  ];
  return (
    <section className={`${panel} p-4 flex flex-col gap-4`} aria-labelledby="today-title">
      <h2 id="today-title" className="flex items-center gap-2 font-semibold"><span className="gem" aria-hidden /> Today</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className={`rounded-xl border p-3 flex flex-col gap-1.5 hover:bg-plum-800/60 ${t.hot ? "border-gold-400 shadow-[0_0_20px_-8px_rgb(240_177_42/0.8)]" : "border-plum-800"}`}>
            <span className="text-xs uppercase tracking-wider text-plum-400">{t.title}</span>
            <span className="font-semibold">{t.body}</span>
            {t.bar && <Bar n={t.bar[0]} max={t.bar[1]} />}
          </Link>
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {q.quests.map((x) => (
          <li key={x.scope + x.id} className="flex flex-col gap-1 text-sm">
            <span className="flex justify-between gap-2">
              <span>{x.claimed ? "✅" : x.progress >= x.goal ? "🎁" : "⬜"} {x.scope === "week" && <b>Weekly: </b>}{x.label}</span>
              <span className="text-plum-400 tabular-nums">{Math.min(x.progress, x.goal)}/{x.goal}</span>
            </span>
            <Bar n={x.progress} max={x.goal} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-plum-500">Claim finished quests in Discord: <code className="text-gold-200">{CONFIG.prefix} quests</code></p>
    </section>
  );
}
