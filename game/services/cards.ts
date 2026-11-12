import { CARDS, RARITIES, ELEMENTS, getCard, type Rarity } from "../data/cards";
import { CARROT_XP, COMBINE_CHANCE, COMBINE_COUNT, CONFIG, REROLL_COST, SHARD_YIELD, craftCost } from "../config";
import { fail } from "../errors";
import { User, UserCard, type CardStatus } from "../models";
import { applyCardXp, burrowEarnings, burrowSlots, cardValue, completedSets, rollVariant, spareCards, feedXp, makeCode, nextRarity, rollCombine, setTitle, type Rng } from "../rules";
import { bump } from "./quests";

/** Cards that can be used up or given away: not busy elsewhere and not 🔒 locked by the player. */
const FREE = { status: "available", locked: { $ne: true } } as const;

export async function grantCard(ownerId: string, slug: string, variant: string, level = 1) {
  for (let i = 0; ; i++) {
    try {
      return await UserCard.create({ code: makeCode(), ownerId, slug, variant, level });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000 || i >= 4) throw e; // code collision: retry with a new code
    }
  }
}

export async function getOwnedCard(ownerId: string, code: string) {
  return (
    (await UserCard.findOne({ ownerId, code: code.toLowerCase() })) ??
    fail("NOT_FOUND", `You don't own a card with code \`${code}\`. Check \`bd col\`.`)
  );
}

/**
 * Moves a card from `available` into a locked state (burrow/trade/listed/auction).
 * Atomic: a card can only ever be locked into one place at a time.
 */
export async function lockCard(ownerId: string, code: string, status: Exclude<CardStatus, "available">, extra: object = {}) {
  const card = await UserCard.findOneAndUpdate(
    { ownerId, code: code.toLowerCase(), ...(status === "burrow" ? { status: "available" } : FREE) },
    { status, ...extra },
    { returnDocument: "after" },
  );
  if (card) return card;
  const c = await getOwnedCard(ownerId, code);
  if (c.locked && c.status === "available") fail("CONFLICT", `\`${c.code}\` is 🔒 locked. Unlock it first: \`bd unlock ${c.code}\`.`);
  return fail("CONFLICT", `\`${c.code}\` is busy (${c.status}). Free it first.`);
}

export async function releaseCard(code: string, from: CardStatus) {
  await UserCard.updateOne({ code, status: from }, { status: "available", $unset: { burrowSince: 1 } });
}

/** Moves a locked card to a new owner. Returns false if it wasn't in the expected state. */
export async function transferCard(code: string, fromId: string, toId: string, from: CardStatus) {
  const r = await UserCard.updateOne({ code, ownerId: fromId, status: from }, { ownerId: toId, status: "available", locked: false });
  if (r.modifiedCount) await User.updateOne({ discordId: fromId }, { $pull: { deck: code } });
  return r.modifiedCount === 1;
}

const RARITY_ORDER = Object.fromEntries(RARITIES.map((r, i) => [r, i]));

export async function listCards(ownerId: string, opts: { rarity?: Rarity; slugs?: string[]; page?: number; perPage?: number } = {}) {
  const perPage = opts.perPage ?? 10;
  const slugs = opts.slugs ?? (opts.rarity ? CARDS.filter((c) => c.rarity === opts.rarity).map((c) => c.slug) : undefined);
  const all = await UserCard.find({ ownerId, ...(slugs && { slug: { $in: slugs } }) }).lean();
  all.sort((a, b) => RARITY_ORDER[getCard(b.slug).rarity] - RARITY_ORDER[getCard(a.slug).rarity] || b.level - a.level);
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const page = Math.min(Math.max(1, opts.page ?? 1), pages);
  return { cards: all.slice((page - 1) * perPage, page * perPage), page, pages, total: all.length };
}

export async function collectionProgress(ownerId: string) {
  const owned = new Set<string>(await UserCard.distinct("slug", { ownerId }));
  const by = <K extends string>(keys: readonly K[], f: (c: (typeof CARDS)[number]) => K) =>
    keys.map((k) => {
      const pool = CARDS.filter((c) => f(c) === k);
      return { key: k, owned: pool.filter((c) => owned.has(c.slug)).length, total: pool.length };
    });
  return {
    owned: owned.size,
    total: CARDS.length,
    rarity: by(RARITIES, (c) => c.rarity),
    element: by(ELEMENTS, (c) => c.element),
    ownedSlugs: owned,
  };
}

/**
 * Feeds cards (by code) or carrots to a target card for XP.
 * `fodder` is either card codes or { item, qty }.
 */
export async function feed(ownerId: string, targetCode: string, fodder: string[] | { item: string; qty: number }) {
  const target = await getOwnedCard(ownerId, targetCode);
  if (!["available", "burrow"].includes(target.status)) fail("CONFLICT", `\`${target.code}\` is ${target.status}; it can't be fed right now.`);
  const def = getCard(target.slug);

  let gained = 0;
  const skipped: string[] = [];
  if (Array.isArray(fodder)) {
    if (!fodder.length) fail("INVALID", "Name at least one card code to feed.");
    const user = await User.findOne({ discordId: ownerId }, { deck: 1 });
    for (const raw of new Set(fodder.map((c) => c.toLowerCase()))) {
      if (raw === target.code) fail("INVALID", "A card can't eat itself.");
      if (user?.deck.includes(raw)) fail("INVALID", `\`${raw}\` is in your battle deck. Remove it first.`);
    }
    for (const code of new Set(fodder.map((c) => c.toLowerCase()))) {
      // Skip (don't throw) so cards already eaten in this loop still pay out their XP.
      const eaten = await UserCard.findOneAndDelete({ ownerId, code, ...FREE });
      if (eaten) gained += feedXp(getCard(eaten.slug), eaten.variant, eaten.level);
      else skipped.push(code);
    }
    if (!gained) fail("CONFLICT", `None of those are available, unlocked cards you own: ${skipped.map((s) => `\`${s}\``).join(", ")}`);
  } else {
    const per = CARROT_XP[fodder.item] ?? fail("INVALID", "Only carrots and golden carrots can be fed.");
    if (!Number.isInteger(fodder.qty) || fodder.qty < 1) fail("INVALID", "Quantity must be a positive whole number.");
    const r = await User.updateOne({ discordId: ownerId, [`items.${fodder.item}`]: { $gte: fodder.qty } }, { $inc: { [`items.${fodder.item}`]: -fodder.qty } });
    if (!r.modifiedCount) fail("INSUFFICIENT_FUNDS", `You don't have ${fodder.qty}× ${fodder.item}. Buy some in \`bd shop\`.`);
    gained = per * fodder.qty;
  }

  // Optimistic update: retry if the card changed between read and write (e.g. a battle gave it XP).
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = attempt === 0 ? target : await getOwnedCard(ownerId, target.code);
    const next = applyCardXp(cur, def.rarity, gained);
    const r = await UserCard.updateOne({ _id: cur._id, level: cur.level, xp: cur.xp }, { level: next.level, xp: next.xp });
    if (r.modifiedCount) {
      await bump(ownerId, "feed");
      return { card: def, code: cur.code, from: cur.level, ...next, gained, skipped };
    }
  }
  return fail("CONFLICT", "That card is busy, try again.");
}

/** Gives XP to cards (battle rewards). Ignores cards that changed owner. */
export async function giveCardXp(ownerId: string, codes: string[], amount: number) {
  for (const code of codes) {
    const c = await UserCard.findOne({ ownerId, code });
    if (!c) continue;
    const next = applyCardXp(c, getCard(c.slug).rarity, amount);
    await UserCard.updateOne({ _id: c._id, level: c.level, xp: c.xp }, { level: next.level, xp: next.xp });
  }
}

export async function npcSell(ownerId: string, code: string) {
  const user = await User.findOne({ discordId: ownerId }, { deck: 1 });
  if (user?.deck.includes(code.toLowerCase())) fail("INVALID", "That card is in your battle deck. Remove it first.");
  const card = await UserCard.findOneAndDelete({ ownerId, code: code.toLowerCase(), ...FREE });
  if (!card) return fail("CONFLICT", `\`${code}\` isn't an available, unlocked card you own.`);
  const coins = Math.max(1, Math.floor(cardValue(getCard(card.slug), card.variant, card.level) * CONFIG.npcSellRate));
  await User.updateOne({ discordId: ownerId }, { $inc: { coins } });
  return { card: getCard(card.slug), coins };
}

/**
 * Combines COMBINE_COUNT available cards of one rarity for a chance at a random card of the next rarity
 * (keeps the best input's variant). On failure all are used up except the most valuable one, which you keep.
 */
export async function combine(ownerId: string, codes: string[], rng: Rng = Math.random) {
  const unique = [...new Set(codes.map((c) => c.toLowerCase()))];
  if (unique.length !== COMBINE_COUNT) fail("INVALID", `Pick exactly ${COMBINE_COUNT} different card codes.`);
  const user = await User.findOne({ discordId: ownerId }, { deck: 1 });
  const inDeck = unique.find((c) => user?.deck.includes(c));
  if (inDeck) fail("INVALID", `\`${inDeck}\` is in your battle deck. Remove it first.`);
  const found = await UserCard.find({ ownerId, code: { $in: unique }, ...FREE });
  const missing = unique.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) fail("CONFLICT", `Not available, unlocked cards you own: ${missing.map((m) => `\`${m}\``).join(", ")}`);
  const rarity = getCard(found[0].slug).rarity;
  if (found.some((c) => getCard(c.slug).rarity !== rarity)) fail("INVALID", "All cards must be the same rarity.");
  if (!nextRarity(rarity)) fail("INVALID", "Secret cards are already the top rarity.");

  // All or nothing: if a card was sold/traded meanwhile, put back the ones already taken.
  const taken: typeof found = [];
  for (const c of found) {
    const d = await UserCard.findOneAndDelete({ _id: c._id, ...FREE });
    if (!d) {
      if (taken.length) await UserCard.insertMany(taken.map((t) => t.toObject()));
      return fail("CONFLICT", "One of those cards just changed. Try again.");
    }
    taken.push(d);
  }
  const value = (c: (typeof found)[number]) => cardValue(getCard(c.slug), c.variant, c.level);
  const best = taken.reduce((a, b) => (value(b) > value(a) ? b : a));
  const chance = COMBINE_CHANCE[rarity];
  const roll = rollCombine(rarity, rng);
  await bump(ownerId, "combine");
  if (roll.success) {
    const uc = await grantCard(ownerId, roll.card.slug, best.variant);
    return { success: true as const, from: rarity, chance, card: roll.card, code: uc.code, variant: best.variant };
  }
  await UserCard.create(best.toObject());
  return { success: false as const, from: rarity, chance, kept: best.code, keptCard: getCard(best.slug) };
}

// ---- Burrow (idle farm) ----

export async function burrowStatus(ownerId: string, now = new Date()) {
  const user = await User.findOne({ discordId: ownerId });
  if (!user) return fail("NOT_FOUND", "Player not found.");
  const cards = await UserCard.find({ ownerId, status: "burrow" }).lean();
  const rows = cards.map((c) => ({ ...c, def: getCard(c.slug), pending: burrowEarnings(getCard(c.slug), c.level, c.burrowSince ?? now, now) }));
  return { cards: rows, slots: burrowSlots(user.level, user.extraBurrowSlots), pending: rows.reduce((s, r) => s + r.pending, 0) };
}

export async function burrowAdd(ownerId: string, code: string) {
  const { cards, slots } = await burrowStatus(ownerId);
  // shortcut: two simultaneous adds can overfill by one slot; harmless, upgrade to a counter if it's abused.
  if (cards.length >= slots) fail("INVALID", `Your burrow is full (${slots} slots). Level up or use a 🗝️ Burrow Key.`);
  const card = await lockCard(ownerId, code, "burrow", { burrowSince: new Date() });
  return getCard(card.slug);
}

/** Collects earnings from every burrowed card. Each card's timer is reset atomically, so double-collecting pays once. */
export async function burrowCollect(ownerId: string, onlyCode?: string, now = new Date()) {
  const cards = await UserCard.find({ ownerId, status: "burrow", ...(onlyCode && { code: onlyCode }) });
  let coins = 0;
  for (const c of cards) {
    if (!c.burrowSince) continue;
    const earned = burrowEarnings(getCard(c.slug), c.level, c.burrowSince, now);
    const r = await UserCard.updateOne({ _id: c._id, burrowSince: c.burrowSince }, { burrowSince: now });
    if (r.modifiedCount) coins += earned;
  }
  await User.updateOne({ discordId: ownerId }, { $inc: { coins } });
  if (coins > 0) await bump(ownerId, "burrow");
  return coins;
}

export async function burrowRemove(ownerId: string, code: string) {
  const card = await getOwnedCard(ownerId, code);
  if (card.status !== "burrow") fail("INVALID", `\`${card.code}\` isn't in your burrow.`);
  const coins = await burrowCollect(ownerId, card.code);
  await releaseCard(card.code, "burrow");
  return { card: getCard(card.slug), coins };
}

// ---- Battle deck ----

export async function setDeck(ownerId: string, codes: string[]) {
  const unique = [...new Set(codes.map((c) => c.toLowerCase()))];
  if (!unique.length || unique.length > CONFIG.teamSize) fail("INVALID", `Pick 1–${CONFIG.teamSize} card codes.`);
  const owned = await UserCard.find({ ownerId, code: { $in: unique } }, { code: 1 });
  const missing = unique.filter((c) => !owned.some((o) => o.code === c));
  if (missing.length) fail("NOT_FOUND", `You don't own: ${missing.map((m) => `\`${m}\``).join(", ")}`);
  await User.updateOne({ discordId: ownerId }, { deck: unique });
  return unique;
}

/** The player's deck as fighters; falls back to their 3 strongest cards if no deck is set. */
export async function getTeam(ownerId: string) {
  const user = await User.findOne({ discordId: ownerId }, { deck: 1 });
  let cards = user?.deck.length ? await UserCard.find({ ownerId, code: { $in: user.deck } }).lean() : [];
  if (user?.deck.length) cards.sort((a, b) => user.deck.indexOf(a.code) - user.deck.indexOf(b.code));
  if (!cards.length) {
    const all = await UserCard.find({ ownerId }).lean();
    const power = (c: (typeof all)[number]) => { const d = getCard(c.slug); return (d.atk * 1.2 + d.def + d.hp * 0.15) * (1 + 0.05 * (c.level - 1)); };
    cards = all.sort((a, b) => power(b) - power(a)).slice(0, CONFIG.teamSize);
  }
  return cards.map((c) => ({ def: getCard(c.slug), level: c.level, code: c.code, variant: c.variant }));
}

// ---- Lock & element sets ----

/** 🔒 A locked card is never fed, combined, sold, listed, auctioned or traded until unlocked. */
export async function setLocked(ownerId: string, code: string, locked: boolean) {
  const c = await UserCard.findOneAndUpdate({ ownerId, code: code.toLowerCase() }, { locked }, { returnDocument: "after" });
  return c ?? fail("NOT_FOUND", `You don't own a card with code \`${code}\`.`);
}

/** Pays a one-time reward + title for every element the player now owns completely. Returns new titles. */
export async function claimSets(ownerId: string) {
  const owned = new Set<string>(await UserCard.distinct("slug", { ownerId }));
  const earned: string[] = [];
  for (const el of completedSets(owned)) {
    const title = setTitle(el);
    const r = await User.updateOne({ discordId: ownerId, titles: { $ne: title } }, { $push: { titles: title }, $inc: { coins: CONFIG.setRewardCoins } });
    if (r.modifiedCount) earned.push(title);
  }
  return earned;
}

// ---- Shards, crafting, gifts, re-rolls ----

/** Cards that `shard dupes` would break: spare duplicates (your best copy of each bunny stays), not locked, not in the deck. */
export async function spareDupes(ownerId: string) {
  const user = await User.findOne({ discordId: ownerId }, { deck: 1 });
  const mine = await UserCard.find({ ownerId, ...FREE, code: { $nin: user?.deck ?? [] } }).lean();
  return spareCards(mine);
}

/** Breaks cards into shards. Cards that changed meanwhile are skipped, never double-counted. */
export async function shardCards(ownerId: string, codes: string[]) {
  const user = await User.findOne({ discordId: ownerId }, { deck: 1 });
  let shards = 0;
  let count = 0;
  for (const code of new Set(codes.map((c) => c.toLowerCase()))) {
    if (user?.deck.includes(code)) continue;
    const d = await UserCard.findOneAndDelete({ ownerId, code, ...FREE });
    if (!d) continue;
    shards += SHARD_YIELD[getCard(d.slug).rarity];
    count++;
  }
  if (!count) fail("CONFLICT", "None of those are available, unlocked cards you own (deck cards are skipped).");
  await User.updateOne({ discordId: ownerId }, { $inc: { shards } });
  return { shards, count };
}

/** Spends shards on one specific card: the fix for "I'll never get the last one". */
export async function craftCard(ownerId: string, slug: string) {
  const def = getCard(slug);
  const cost = craftCost(def.rarity) ?? fail("INVALID", "Secret cards can't be crafted.");
  const r = await User.updateOne({ discordId: ownerId, shards: { $gte: cost } }, { $inc: { shards: -cost } });
  if (!r.modifiedCount) fail("INSUFFICIENT_FUNDS", `Crafting ${def.name} costs 💠 ${cost} shards.`);
  const uc = await grantCard(ownerId, slug, "normal");
  return { card: def, code: uc.code, cost };
}

/** Gives a card to another player, no strings attached. */
export async function giftCard(fromId: string, toId: string, code: string) {
  if (fromId === toId) fail("INVALID", "You can't gift yourself.");
  if (!(await User.exists({ discordId: toId }))) fail("NOT_FOUND", "That player hasn't started yet.");
  const user = await User.findOne({ discordId: fromId }, { deck: 1 });
  if (user?.deck.includes(code.toLowerCase())) fail("INVALID", "That card is in your battle deck. Remove it first.");
  const c = await UserCard.findOneAndUpdate({ ownerId: fromId, code: code.toLowerCase(), ...FREE }, { ownerId: toId, locked: false }, { returnDocument: "after" });
  return c ? getCard(c.slug) : fail("CONFLICT", `\`${code}\` isn't an available, unlocked card you own.`);
}

/** Pays coins to roll a new variant. It can roll down too: that's the gamble. */
export async function rerollVariant(ownerId: string, code: string, rng: Rng = Math.random) {
  const card = await getOwnedCard(ownerId, code);
  if (card.locked || card.status !== "available") fail("CONFLICT", `\`${card.code}\` must be available and unlocked to re-roll.`);
  const cost = REROLL_COST[getCard(card.slug).rarity];
  const r = await User.updateOne({ discordId: ownerId, coins: { $gte: cost } }, { $inc: { coins: -cost } });
  if (!r.modifiedCount) fail("INSUFFICIENT_FUNDS", `Re-rolling costs ${cost.toLocaleString()} coins.`);
  const variant = rollVariant(rng);
  const u = await UserCard.updateOne({ _id: card._id, ...FREE }, { variant });
  if (!u.modifiedCount) {
    await User.updateOne({ discordId: ownerId }, { $inc: { coins: cost } }); // card changed meanwhile: refund
    fail("CONFLICT", "That card just changed. Try again.");
  }
  return { card: getCard(card.slug), code: card.code, from: card.variant, variant, cost };
}
