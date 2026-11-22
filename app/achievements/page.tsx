import { achievementBoard } from "@/game/services/achievements";
import { requireUid } from "../lib/session";
import { Page, coins, panel } from "../components";

export default async function AchievementsPage() {
  const uid = await requireUid();
  const b = await achievementBoard(uid); // payouts happen in the layout, which renders first
  return (
    <Page title={`Achievements ${b.done}/${b.total}`}>
      <p className="text-sm text-plum-400">One-time goals. Each pays its coins the moment you reach it, on Discord or here.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {b.rows.map((a) => {
          const yesNo = a.stat === "rarest"; // rarity goals are reached or not, no counter
          const pct = a.done ? 100 : yesNo ? 0 : Math.round((Math.max(0, a.progress) / a.goal) * 100);
          return (
            <li key={a.id} className={`${panel} flex gap-3 p-3 ${a.done ? "border-gold-500/60" : "opacity-90"}`}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full text-2xl ${a.done ? "bg-gold-500/20 ring-2 ring-gold-400" : "bg-plum-800 grayscale"}`} aria-hidden>{a.emoji}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <strong className={a.done ? "text-gold-200" : "text-plum-100"}>{a.name}</strong>
                  <span className="shrink-0 text-xs text-plum-400">{a.done ? "✅ Earned" : coins(a.coins)}</span>
                </div>
                <span className="text-sm text-plum-300">{a.desc}</span>
                {!a.done && !yesNo && (
                  <div className="flex items-center gap-2 text-xs text-plum-400">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-plum-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.name} progress`}>
                      <div className="h-full rounded-full bg-gold-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums">{Math.max(0, a.progress).toLocaleString()}/{a.goal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
