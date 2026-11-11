import { CARDS } from "../data/cards";
import { CONFIG, ITEMS, itemInfo } from "../config";
import { fail } from "../errors";
import { User, UserCard } from "../models";
import { energyNow, energyWaitMs, isRarePlus, maxEnergy, msUntilShopReset, playerLevel, rollHunt, formatDuration, shopDay, type Rng } from "../rules";
import { grantCard } from "./cards";

const STARTERS = CARDS.filter((c) => c.flags?.isStarter).map((c) => c.slug);

/** Gets the player, creating them (with starter coins + cards) on first contact. */
export async function ensureUser(discordId: string, username = "") {
  const existing = await User.findOne({ discordId });
  if (existing) {
    if (username && existing.username !== username) await User.updateOne({ discordId }, { username });
    return { user: existing, isNew: false };
  }
  try {
    const user = await User.create({ discordId, username, coins: CONFIG.starterCoins });
    for (const slug of STARTERS) await grantCard(discordId, slug, "normal");
    return { user, isNew: true };
  } catch (e) {
    // Two messages raced to create the same player: the other one won, just load it.
    if ((e as { code?: number }).code === 11000) return { user: (await User.findOne({ discordId }))!, isNew: false };
    throw e;
  }
}

export async function getUser(discordId: string) {
  return (await User.findOne({ discordId })) ?? fail("NOT_FOUND", "That player hasn't started yet. They need to use any `bd` command first.");
}

/** Atomically removes coins; fails without touching anything if the balance is too low. */
export async function spendCoins(discordId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 0) fail("INVALID", "Amount must be a whole number.");
  if (amount === 0) return;
  const r = await User.updateOne({ discordId, coins: { $gte: amount } }, { $inc: { coins: -amount } });
  if (r.modifiedCount === 0) fail("INSUFFICIENT_FUNDS", `You need ${amount.toLocaleString()} coins.`);
}

export async function addCoins(discordId: string, amount: number) {
  if (amount > 0) await User.updateOne({ discordId }, { $inc: { coins: Math.floor(amount) } });
}

export async function takeItem(discordId: string, slug: string, qty = 1) {
  const r = await User.updateOne({ discordId, [`items.${slug}`]: { $gte: qty } }, { $inc: { [`items.${slug}`]: -qty } });
  if (r.modifiedCount === 0) fail("INSUFFICIENT_FUNDS", `You don't have ${qty}× ${itemInfo(slug)?.name ?? slug}.`);
}

export async function giveItem(discordId: string, slug: string, qty = 1) {
  await User.updateOne({ discordId }, { $inc: { [`items.${slug}`]: qty } });
}

/** Adds player XP and syncs the stored level. */
export async function addXp(discordId: string, amount: number) {
  const user = await User.findOneAndUpdate({ discordId }, { $inc: { xp: amount } }, { returnDocument: "after" });
  if (!user) return { level: 1, leveledUp: false };
  const { level } = playerLevel(user.xp);
  if (level !== user.level) await User.updateOne({ discordId }, { level });
  return { level, leveledUp: level > user.level };
}

/** Current energy for display. */
export async function getEnergy(discordId: string, now = new Date()) {
  const u = await getUser(discordId);
  const max = maxEnergy(u.level);
  return { ...energyNow(u.energy, u.energyAt, max, now), max };
}

/**
 * Sets energy to f(current, max). Optimistic: the write only succeeds if nobody changed
 * energy since we read it, so two parallel hunts can't spend the same point.
 */
async function updateEnergy(discordId: string, f: (e: { energy: number; nextInMs: number }, max: number) => number, extra: object = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const u = await getUser(discordId);
    const now = new Date();
    const max = maxEnergy(u.level);
    const e = energyNow(u.energy, u.energyAt, max, now);
    const next = f(e, max);
    const user = await User.findOneAndUpdate(
      { discordId, energy: u.energy ?? null, energyAt: u.energyAt ?? null },
      { $set: { energy: next, energyAt: e.anchor }, ...extra },
      { returnDocument: "after" },
    );
    if (user) return { user, energy: next, max };
  }
  return fail("CONFLICT", "You're doing too much at once. Try again.");
}

export async function spendEnergy(discordId: string, cost: number, extra: object = {}) {
  return updateEnergy(
    discordId,
    (e) => {
      if (e.energy < cost) {
        const wait = energyWaitMs(e, cost);
        fail("COOLDOWN", `⚡ Not enough energy (${e.energy}/${cost}). It refills +1 every minute, so you can go again in about **${formatDuration(wait)}**. Or drink 🧃 Carrot Juice.`);
      }
      return e.energy - cost;
    },
    extra,
  );
}

/** Atomically claims a cooldown (daily), so spamming a command can't claim it twice. */
export async function claimCooldown(discordId: string, field: "lastDaily", ms: number, extra: object = {}) {
  const now = new Date();
  const user = await User.findOneAndUpdate(
    { discordId, $or: [{ [field]: null }, { [field]: { $lte: new Date(now.getTime() - ms) } }] },
    { $set: { [field]: now }, ...extra },
    { returnDocument: "after" },
  );
  if (user) return user;
  const u = await getUser(discordId);
  const left = (u[field] as Date).getTime() + ms - now.getTime();
  return fail("COOLDOWN", `Slow down! Try again in **${formatDuration(left)}**.`);
}

export async function daily(discordId: string) {
  await claimCooldown(discordId, "lastDaily", CONFIG.dailyCooldownMs);
  await addCoins(discordId, CONFIG.dailyCoins);
  await giveItem(discordId, "carrot", 2);
  const e = await updateEnergy(discordId, (e, max) => Math.max(e.energy, max)); // refill, never reduce juice overflow
  return { coins: CONFIG.dailyCoins, carrots: 2, energy: e.energy, max: e.max };
}

export async function work(discordId: string, rng: Rng = Math.random) {
  const e = await spendEnergy(discordId, CONFIG.energyCost.work);
  const coins = CONFIG.workMin + Math.floor(rng() * (CONFIG.workMax - CONFIG.workMin + 1));
  await addCoins(discordId, coins);
  const xp = await addXp(discordId, 5);
  return { coins, energy: e.energy, maxEnergy: e.max, ...xp };
}

/** One roll with the player's current pity/clover state; grants the card and updates the counters. */
async function rollOne(discordId: string, state: { cloverHunts: number; huntsSinceRare: number }, rng: Rng) {
  const clover = state.cloverHunts > 0;
  const pity = state.huntsSinceRare + 1 >= CONFIG.pityHunts;
  const { card, variant } = rollHunt(rng, { clover, pity });
  const uc = await grantCard(discordId, card.slug, variant);
  const rare = isRarePlus(card.rarity);
  const inc: Record<string, number> = clover ? { cloverHunts: -1 } : {};
  if (!rare) inc.huntsSinceRare = 1;
  await User.updateOne({ discordId }, { ...(rare && { $set: { huntsSinceRare: 0 } }), ...(Object.keys(inc).length && { $inc: inc }) });
  if (clover) state.cloverHunts--;
  state.huntsSinceRare = rare ? 0 : state.huntsSinceRare + 1;
  return { card, variant, code: uc.code, clover, pity };
}

export const HUNT_BATCHES = [1, 5, 10] as const;

/**
 * Hunts `count` times (1, 5 or 10). All the energy is spent up front in one atomic step, so a ×10 either fully
 * happens or (not enough energy) changes nothing. Each roll then uses the same pity/clover rules as a single hunt.
 */
export async function huntMany(discordId: string, count: number, rng: Rng = Math.random) {
  if (!HUNT_BATCHES.includes(count as 1)) fail("INVALID", `You can hunt ${HUNT_BATCHES.join(", ")} at a time.`);
  const { user, energy, max } = await spendEnergy(discordId, CONFIG.energyCost.hunt * count, { $inc: { "stats.hunts": count } });
  const state = { cloverHunts: user.cloverHunts, huntsSinceRare: user.huntsSinceRare };
  const cards = [];
  for (let i = 0; i < count; i++) cards.push(await rollOne(discordId, state, rng));
  const xp = await addXp(discordId, CONFIG.huntXp * count);
  return { cards, energy, maxEnergy: max, ...xp };
}

export async function hunt(discordId: string, rng: Rng = Math.random) {
  const { cards: [one], ...rest } = await huntMany(discordId, 1, rng);
  return { ...one, ...rest };
}

export async function buyItem(discordId: string, slug: string, qty = 1) {
  const item = itemInfo(slug) ?? fail("NOT_FOUND", "No such item. See `bd shop`.");
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) fail("INVALID", "Quantity must be 1–100.");
  const cost = item.price * qty;
  const limit = item.dailyLimit;
  const key = `shopBuys.${slug}`;
  if (limit) {
    if (qty > limit) fail("INVALID", `You can buy at most ${limit}× ${item.name} per day.`);
    const today = shopDay(new Date());
    // New day: clear yesterday's counts.
    await User.updateOne({ discordId, shopDay: { $ne: today } }, { $set: { shopDay: today, shopBuys: {} } });
    // Reserve the buys atomically so parallel purchases can't exceed the limit.
    const r = await User.updateOne(
      { discordId, shopDay: today, $or: [{ [key]: { $exists: false } }, { [key]: { $lte: limit - qty } }] },
      { $inc: { [key]: qty } },
    );
    if (!r.modifiedCount) {
      const left = limit - ((await getUser(discordId)).shopBuys?.get(slug) ?? 0);
      fail("COOLDOWN", `Daily limit reached for ${item.name} (${Math.max(0, left)} of ${limit} left today). Resets in **${formatDuration(msUntilShopReset(new Date()))}**.`);
    }
  }
  try {
    await spendCoins(discordId, cost);
  } catch (e) {
    if (limit) await User.updateOne({ discordId }, { $inc: { [key]: -qty } }); // give the reservation back
    throw e;
  }
  await giveItem(discordId, slug, qty);
  return { item, qty, cost };
}

/** How many of each limited item the player can still buy today. */
export async function shopLimitsLeft(discordId: string) {
  const u = await getUser(discordId);
  const today = shopDay(new Date());
  const left: Record<string, number> = {};
  for (const i of ITEMS) if (i.dailyLimit) left[i.slug] = i.dailyLimit - (u.shopDay === today ? (u.shopBuys?.get(i.slug) ?? 0) : 0);
  return { left, resetInMs: msUntilShopReset(new Date()) };
}

/** Use a consumable that isn't fed to a card. Carrots are used via feed. */
export async function consumeItem(discordId: string, slug: string) {
  if (slug === "clover") {
    await takeItem(discordId, slug);
    await User.updateOne({ discordId }, { $inc: { cloverHunts: CONFIG.baitHuntsPerUse } });
    return `🍀 Your next ${CONFIG.baitHuntsPerUse} hunts have doubled rare+ odds.`;
  }
  if (slug === "juice") {
    await takeItem(discordId, slug);
    const e = await updateEnergy(discordId, (e) => e.energy + CONFIG.juiceEnergy);
    return `🧃 +${CONFIG.juiceEnergy} energy! ⚡ ${e.energy}/${e.max}`;
  }
  if (slug === "burrow-key") {
    await takeItem(discordId, slug);
    await User.updateOne({ discordId }, { $inc: { extraBurrowSlots: 1 } });
    return "🗝️ Your burrow gained a permanent slot.";
  }
  if (slug === "carrot" || slug === "golden-carrot") return fail("INVALID", "Feed carrots to a card: `bd feed <card code> carrot [qty]`.");
  return fail("NOT_FOUND", "You can't use that.");
}

export async function profile(discordId: string) {
  const user = await getUser(discordId);
  const [cards, distinct] = await Promise.all([
    UserCard.countDocuments({ ownerId: discordId }),
    UserCard.distinct("slug", { ownerId: discordId }),
  ]);
  return { user, lvl: playerLevel(user.xp), cards, collected: distinct.length, total: CARDS.length };
}

export async function leaderboard(kind: "coins" | "level" | "collection", limit = 10) {
  if (kind === "collection") {
    const rows = await UserCard.aggregate<{ _id: string; n: number }>([
      { $group: { _id: { o: "$ownerId", s: "$slug" } } },
      { $group: { _id: "$_id.o", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: limit },
    ]);
    const users = await User.find({ discordId: { $in: rows.map((r) => r._id) } }, { discordId: 1, username: 1 });
    const name = new Map(users.map((u) => [u.discordId, u.username]));
    return rows.map((r) => ({ discordId: r._id, username: name.get(r._id) ?? "?", value: r.n }));
  }
  const sort = kind === "coins" ? "-coins" : "-xp";
  const users = await User.find({}, { discordId: 1, username: 1, coins: 1, level: 1 }).sort(sort).limit(limit);
  return users.map((u) => ({ discordId: u.discordId, username: u.username, value: kind === "coins" ? u.coins : u.level }));
}
