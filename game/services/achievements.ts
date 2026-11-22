import { ACHIEVEMENTS } from "../config";
import { fail } from "../errors";
import { User } from "../models";
import { achievementStats, dueAchievements } from "../rules";
import { ownedPairs } from "./cards";

async function load(discordId: string) {
  const [found, pairs] = await Promise.all([User.findOne({ discordId }).lean(), ownedPairs(discordId)]);
  const u = found ?? fail("NOT_FOUND", "Player not found.");
  return { have: u.achievements ?? [], stats: achievementStats(u, pairs) };
}

/**
 * Pays out every achievement the player has newly reached and returns them. Each payout is guarded by
 * `achievements: { $ne: id }`, so two commands racing can't pay the same one twice.
 */
export async function claimAchievements(discordId: string) {
  const { have, stats } = await load(discordId);
  const earned = [];
  for (const a of dueAchievements(stats, have)) {
    const r = await User.updateOne({ discordId, achievements: { $ne: a.id } }, { $push: { achievements: a.id }, $inc: { coins: a.coins } });
    if (r.modifiedCount) earned.push(a);
  }
  return earned;
}

/** Every achievement with the player's progress toward it. */
export async function achievementBoard(discordId: string) {
  const { have, stats } = await load(discordId);
  const rows = ACHIEVEMENTS.map((a) => ({ ...a, done: have.includes(a.id), progress: Math.min(stats[a.stat], a.goal) }));
  return { rows, done: rows.filter((r) => r.done).length, total: rows.length };
}
