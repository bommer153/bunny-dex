import { CONFIG } from "../config";
import { fail } from "../errors";
import { User } from "../models";
import { resolveBattle, type Rng } from "../rules";
import { getTeam, giveCardXp } from "./cards";
import { addCoins, addXp, getUser, spendEnergy } from "./player";

async function reward(id: string, won: boolean, codes: string[]) {
  await addCoins(id, won ? CONFIG.battleWinCoins : CONFIG.battleLossCoins);
  await User.updateOne({ discordId: id }, { $inc: { [won ? "stats.battlesWon" : "stats.battlesLost"]: 1 } });
  await giveCardXp(id, codes, won ? CONFIG.cardWinXp : CONFIG.cardLossXp);
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

/** Fights a random other player's team. Only the attacker earns rewards; the defender loses nothing. */
export async function randomFight(aId: string, rng: Rng = Math.random) {
  const [opp] = await User.aggregate<{ discordId: string }>([{ $match: { discordId: { $ne: aId } } }, { $sample: { size: 1 } }, { $project: { discordId: 1 } }]);
  if (!opp) return fail("NOT_FOUND", "No other players to fight yet.");
  await spendEnergy(aId, CONFIG.energyCost.battle); // only charge once there's someone to fight
  const [a, b] = await Promise.all([getTeam(aId), getTeam(opp.discordId)]);
  const result = resolveBattle(a, b, rng);
  const lvl = result.winner ? await reward(aId, result.winner === "a", a.map((c) => c.code)) : null;
  const defender = await getUser(opp.discordId);
  return { ...result, a, b, opponent: { discordId: opp.discordId, username: defender.username }, lvl };
}
