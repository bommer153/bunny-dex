import { CONFIG, TUTORIAL, WEEKLY_QUEST, type Quest, type QuestKind } from "../config";
import { fail } from "../errors";
import { User } from "../models";
import { dailyQuests, msUntilShopReset, shopDay, weekKey } from "../rules";

/** Clears last day's/week's counters once the day or week changes. */
async function rollOver(discordId: string, now: Date) {
  const day = shopDay(now);
  const week = weekKey(day);
  await User.updateOne({ discordId, questDay: { $ne: day } }, { $set: { questDay: day, dayCounts: {}, dayClaimed: [] } });
  await User.updateOne({ discordId, questWeek: { $ne: week } }, { $set: { questWeek: week, weekCounts: {}, weekClaimed: [] } });
}

/** Counts progress toward quests (called by the game actions themselves, so bot and web both count). */
export async function bump(discordId: string, kind: QuestKind, n = 1, now = new Date()) {
  await rollOver(discordId, now);
  const step = TUTORIAL.some((t) => t.id === kind) ? { $addToSet: { tutorial: kind } } : {};
  await User.updateOne({ discordId }, { $inc: { [`dayCounts.${kind}`]: n, [`weekCounts.${kind}`]: n }, ...step });
}

export type QuestRow = Quest & { scope: "day" | "week"; progress: number; claimed: boolean };

export async function questBoard(discordId: string, now = new Date()) {
  await rollOver(discordId, now);
  const u = (await User.findOne({ discordId })) ?? fail("NOT_FOUND", "Player not found.");
  const row = (q: Quest, scope: "day" | "week"): QuestRow => ({
    ...q,
    scope,
    progress: (scope === "day" ? u.dayCounts : u.weekCounts)?.get(q.id) ?? 0,
    claimed: (scope === "day" ? u.dayClaimed : u.weekClaimed).includes(q.id),
  });
  const quests = [...dailyQuests(discordId, shopDay(now)).map((q) => row(q, "day")), row(WEEKLY_QUEST, "week")];
  const tutorial = u.tutorialDone ? null : TUTORIAL.map((t) => ({ ...t, done: u.tutorial.includes(t.id) }));
  return { quests, tutorial, resetInMs: msUntilShopReset(now) };
}

/** Pays out every finished, unclaimed quest (and the First steps reward). Each payout is guarded so double clicks pay once. */
export async function claimQuests(discordId: string, now = new Date()) {
  const { quests, tutorial } = await questBoard(discordId, now);
  const ready = quests.filter((q) => !q.claimed && q.progress >= q.goal);
  const firstSteps = !!tutorial?.every((t) => t.done);
  if (!ready.length && !firstSteps) fail("INVALID", "No finished quests to claim yet.");
  let tutorialPaid = false;
  if (firstSteps) {
    // $ne: older players have no tutorialDone field at all.
    const r = await User.updateOne({ discordId, tutorialDone: { $ne: true } }, { $set: { tutorialDone: true }, $inc: { coins: CONFIG.tutorialCoins, "items.clover": 2 } });
    tutorialPaid = r.modifiedCount === 1;
  }
  const got: QuestRow[] = [];
  for (const q of ready) {
    const list = q.scope === "day" ? "dayClaimed" : "weekClaimed";
    const items = Object.fromEntries(Object.entries(q.items ?? {}).map(([k, v]) => [`items.${k}`, v ?? 0]));
    const r = await User.updateOne({ discordId, [list]: { $ne: q.id } }, { $push: { [list]: q.id }, $inc: { coins: q.coins, ...items } });
    if (r.modifiedCount) got.push(q);
  }
  return { got, tutorialPaid };
}
