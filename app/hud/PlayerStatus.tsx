// Header status chips from the player's real data: coins, energy (+ refill timer), level/XP, daily availability.
// Server component; server actions revalidate the layout so these update after every action.
import Link from "next/link";
import { CONFIG } from "@/game/config";
import { energyWaitMs, formatDuration, playerLevel } from "@/game/rules";
import { getEnergy, getUser } from "@/game/services/player";

const chip = "flex items-center gap-1.5 rounded-full border border-plum-700 bg-plum-900/90 px-2.5 py-1 text-sm tabular-nums";

export default async function PlayerStatus({ uid, now }: { uid: string; now: number }) {
  const [u, en] = await Promise.all([getUser(uid), getEnergy(uid)]).catch(() => [null, null] as const);
  if (!u || !en) return null; // brand-new player before their first page load
  const lvl = playerLevel(u.xp);
  const dailyLeft = u.lastDaily ? u.lastDaily.getTime() + CONFIG.dailyCooldownMs - now : 0;
  const full = en.energy >= en.max;
  return (
    <ul aria-label="Your status" className="flex min-w-0 flex-wrap items-center gap-1.5">
      <li className={chip} title="Coins">
        <span aria-hidden>🪙</span><span className="sr-only">Coins</span>
        <span className="font-semibold text-gold-300">{u.coins.toLocaleString()}</span>
      </li>
      <li className={chip} title={full ? "Energy full" : `+1 in ${formatDuration(en.nextInMs)}, full in ${formatDuration(energyWaitMs(en, en.max))}`}>
        <span aria-hidden>⚡</span><span className="sr-only">Energy</span>
        <span className="font-semibold">{en.energy}<span className="text-plum-400">/{en.max}</span></span>
        <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-plum-800 sm:block" aria-hidden>
          <span className="block h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${Math.min(100, (en.energy / en.max) * 100)}%` }} />
        </span>
        {!full && <span className="hidden text-xs text-plum-400 xl:inline">+1 in {formatDuration(en.nextInMs)}</span>}
      </li>
      <li className={`${chip} hidden sm:flex`} title={`XP ${lvl.into}/${lvl.need}`}>
        <span className="gem" aria-hidden />
        <span>Lv <strong>{lvl.level}</strong></span>
        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-plum-800" aria-hidden>
          <span className="block h-full rounded-full bg-gem" style={{ width: `${Math.round((lvl.into / lvl.need) * 100)}%` }} />
        </span>
      </li>
      <li className="hidden md:block">
        {dailyLeft <= 0 ? (
          <Link href="/profile#daily" className={`${chip} border-gold-500/70 text-gold-200 fx-glow`}>📅 Daily ready</Link>
        ) : (
          <span className={`${chip} text-plum-400`} title="Next daily">📅 {formatDuration(dailyLeft)}</span>
        )}
      </li>
    </ul>
  );
}
