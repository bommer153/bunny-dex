import { CONFIG } from "../config";
import { fail } from "../errors";
import { User } from "../models";
import { resolveBattle, towerReward, towerTeam, type Rng } from "../rules";
import { getTeam, giveCardXp } from "./cards";
import { addCoins, addXp, getUser, spendEnergy } from "./player";
import { bump } from "./quests";

async function reward(id: string, won: boolean, codes: string[]) {
  await addCoins(id, won ? CONFIG.battleWinCoins : CONFIG.battleLossCoins);
  await User.updateOne({ discordId: id }, { $inc: { [won ? "stats.battlesWon" : "stats.battlesLost"]: 1 } });
  await giveCardXp(id, codes, won ? CONFIG.cardWinXp : CONFIG.cardLossXp);
  if (won) await bump(id, "win");
  return addXp(id, won ? CONFIG.battleWinXp : CONFIG.battleLossXp);
}

/** Both players agreed (bot handles the Accept button). Both get rewards. */
export async function fight(aId: string, bId: string, rng: Rng = Math.random) {
  if (aId === bId) fail("INVALID", "You can't battle yourself.");
  const [a, b] = await Promise.all([getTeam(aId), getTeam(bId)]);
  if (!a.length || !b.length) fail("INVALID", "Both players need at least one card.");
  const result = resolveBattle(a, b, rng);
  if (result.winner) {
    await reward(aId, result.winner === "a", a.map((c) => c.code));
    await reward(bId, result.winner === "b", b.map((c) => c.code));
  }
  return { ...result, a, b };
}

async function randomOpponent(aId: string) {
  const [opp] = await User.aggregate<{ discordId: string }>([{ $match: { discordId: { $ne: aId } } }, { $sample: { size: 1 } }, { $project: { discordId: 1 } }]);
  return opp ?? fail("NOT_FOUND", "No other players to fight yet.");
}

/** Picks a random opponent and shows both teams before any energy is spent, so the player can adapt their deck. */
export async function scout(aId: string) {
  const opp = await randomOpponent(aId);
  const [a, b, defender] = await Promise.all([getTeam(aId), getTeam(opp.discordId), getUser(opp.discordId)]);
  return { a, b, opponent: { discordId: opp.discordId, username: defender.username } };
}

/** Fights a random (or the scouted) player's team. Only the attacker earns rewards; the defender loses nothing. */
export async function randomFight(aId: string, rng: Rng = Math.random, oppId?: string) {
  if (oppId === aId) fail("INVALID", "You can't battle yourself.");
  const opp = oppId ? { discordId: oppId } : await randomOpponent(aId);
  await spendEnergy(aId, CONFIG.energyCost.battle); // only charge once there's someone to fight
  const [a, b] = await Promise.all([getTeam(aId), getTeam(opp.discordId)]);
  const result = resolveBattle(a, b, rng);
  const lvl = result.winner ? await reward(aId, result.winner === "a", a.map((c) => c.code)) : null;
  const defender = await getUser(opp.discordId);
  return { ...result, a, b, opponent: { discordId: opp.discordId, username: defender.username }, lvl };
}

/** Meadow Tower: fixed PvE floors. Clearing a floor pays once and unlocks the next. */
export async function towerFight(aId: string, rng: Rng = Math.random) {
  const u = await getUser(aId);
  const floor = (u.towerFloor ?? 0) + 1;
  if (floor > CONFIG.towerMaxFloor) fail("INVALID", "🏰 You've cleared the whole tower!");
  const a = await getTeam(aId);
  if (!a.length) fail("INVALID", "You need at least one card.");
  await spendEnergy(aId, CONFIG.energyCost.battle);
  const b = towerTeam(floor);
  const result = resolveBattle(a, b, rng);
  let reward = null;
  if (result.winner === "a") {
    // Guarded on the floor number so a double click can't clear (and pay) the same floor twice.
    const r = await User.updateOne({ discordId: aId, towerFloor: u.towerFloor ?? 0 }, { $set: { towerFloor: floor } });
    if (r.modifiedCount) {
      reward = towerReward(floor);
      await User.updateOne({ discordId: aId }, { $inc: { coins: reward.coins, shards: reward.shards } });
      await giveCardXp(aId, a.map((c) => c.code), CONFIG.cardWinXp);
      await bump(aId, "win");
    }
  }
  return { ...result, a, b, floor, reward };
}
