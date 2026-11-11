import { CONFIG } from "../config";
import { fail } from "../errors";
import { Trade, User } from "../models";
import { makeCode } from "../rules";
import { lockCard, releaseCard, transferCard } from "./cards";
import { addCoins, getUser, spendCoins } from "./player";

type Side = "from" | "to";
const OPEN = { status: { $in: ["pending", "open"] as ("pending" | "open")[] } };

async function sideOf(discordId: string, code?: string) {
  const trade = await Trade.findOne({ ...(code ? { code } : {}), $or: [{ fromId: discordId }, { toId: discordId }], ...OPEN, expiresAt: { $gt: new Date() } });
  if (!trade) return fail("NOT_FOUND", "You have no open trade. Start one with `bd trade @user`.");
  return { trade, side: (trade.fromId === discordId ? "from" : "to") as Side };
}

export async function createTrade(fromId: string, toId: string) {
  if (fromId === toId) fail("INVALID", "You can't trade with yourself.");
  await getUser(toId);
  const busy = await Trade.findOne({ $or: [{ fromId: { $in: [fromId, toId] } }, { toId: { $in: [fromId, toId] } }], ...OPEN, expiresAt: { $gt: new Date() } });
  if (busy) fail("CONFLICT", "One of you already has an open trade. Finish or `bd trade cancel` it first.");
  return Trade.create({ code: makeCode(), fromId, toId, expiresAt: new Date(Date.now() + CONFIG.tradeTtlMs) });
}

export async function acceptTrade(toId: string, code: string) {
  const t = await Trade.findOneAndUpdate({ code, toId, status: "pending", expiresAt: { $gt: new Date() } }, { status: "open" }, { returnDocument: "after" });
  return t ?? fail("NOT_FOUND", "That trade request is gone or isn't for you.");
}

/** Any change to the offer resets both confirmations, so nobody confirms a deal that changed under them. */
const RESET = { "from.confirmed": false, "to.confirmed": false };

export async function addTradeCard(discordId: string, cardCode: string) {
  const { trade, side } = await sideOf(discordId);
  if (trade.status !== "open") fail("INVALID", "Your partner hasn't accepted the trade yet.");
  if (trade[side].cards.length >= 10) fail("INVALID", "Max 10 cards per side.");
  const user = await User.findOne({ discordId }, { deck: 1 });
  if (user?.deck.includes(cardCode.toLowerCase())) fail("INVALID", "That card is in your battle deck. Remove it first.");
  const card = await lockCard(discordId, cardCode, "trade");
  const r = await Trade.updateOne({ _id: trade._id, status: "open" }, { $push: { [`${side}.cards`]: card.code }, $set: RESET });
  if (!r.modifiedCount) {
    await releaseCard(card.code, "trade");
    fail("CONFLICT", "The trade closed.");
  }
  return Trade.findById(trade._id);
}

export async function removeTradeCard(discordId: string, cardCode: string) {
  const { trade, side } = await sideOf(discordId);
  const code = cardCode.toLowerCase();
  const r = await Trade.updateOne({ _id: trade._id, status: "open", [`${side}.cards`]: code }, { $pull: { [`${side}.cards`]: code }, $set: RESET });
  if (!r.modifiedCount) fail("NOT_FOUND", "That card isn't in your offer.");
  await releaseCard(code, "trade");
  return Trade.findById(trade._id);
}

export async function setTradeCoins(discordId: string, coins: number) {
  if (!Number.isInteger(coins) || coins < 0) fail("INVALID", "Coins must be a whole number ≥ 0.");
  const { trade, side } = await sideOf(discordId);
  if (trade.status !== "open") fail("INVALID", "Your partner hasn't accepted the trade yet.");
  const user = await getUser(discordId);
  if (user.coins < coins) fail("INSUFFICIENT_FUNDS", `You only have ${user.coins.toLocaleString()} coins.`);
  await Trade.updateOne({ _id: trade._id, status: "open" }, { $set: { [`${side}.coins`]: coins, ...RESET } });
  return Trade.findById(trade._id);
}

export async function confirmTrade(discordId: string, code?: string) {
  const { trade, side } = await sideOf(discordId, code);
  if (trade.status !== "open") fail("INVALID", "Your partner hasn't accepted the trade yet.");
  const t = await Trade.findOneAndUpdate({ _id: trade._id, status: "open" }, { [`${side}.confirmed`]: true }, { returnDocument: "after" });
  if (t?.from.confirmed && t.to.confirmed) return { trade: await settleTrade(t._id.toString()), settled: true };
  return { trade: t, settled: false };
}

/** Releases every locked card and closes the trade. */
async function closeTrade(id: string, status: "cancelled") {
  const t = await Trade.findOneAndUpdate({ _id: id, ...OPEN }, { status }, { returnDocument: "after" });
  if (t) for (const c of [...t.from.cards, ...t.to.cards]) await releaseCard(c, "trade");
  return t;
}

export async function cancelTrade(discordId: string, code?: string) {
  const { trade } = await sideOf(discordId, code);
  return closeTrade(trade._id.toString(), "cancelled");
}

async function settleTrade(id: string) {
  // Flip to "settling" first: only one caller can ever get past this line.
  const t = await Trade.findOneAndUpdate({ _id: id, status: "open", "from.confirmed": true, "to.confirmed": true }, { status: "settling" }, { returnDocument: "after" });
  if (!t) return fail("CONFLICT", "Trade already settled.");

  // Take both sides' coins up front; if either can't pay, undo and reopen.
  try {
    await spendCoins(t.fromId, t.from.coins);
  } catch {
    await Trade.updateOne({ _id: id }, { status: "open", $set: RESET });
    return fail("INSUFFICIENT_FUNDS", "The trade starter no longer has enough coins. Both confirmations were reset.");
  }
  try {
    await spendCoins(t.toId, t.to.coins);
  } catch {
    await addCoins(t.fromId, t.from.coins);
    await Trade.updateOne({ _id: id }, { status: "open", $set: RESET });
    return fail("INSUFFICIENT_FUNDS", "Your partner no longer has enough coins. Both confirmations were reset.");
  }
  for (const c of t.from.cards) await transferCard(c, t.fromId, t.toId, "trade");
  for (const c of t.to.cards) await transferCard(c, t.toId, t.fromId, "trade");
  await addCoins(t.toId, t.from.coins);
  await addCoins(t.fromId, t.to.coins);
  return Trade.findOneAndUpdate({ _id: id }, { status: "done" }, { returnDocument: "after" });
}

export async function getTrade(code: string) {
  return (await Trade.findOne({ code })) ?? fail("NOT_FOUND", "Trade not found.");
}

/** Cancels timed-out trades and frees their cards. */
export async function expireTrades(now = new Date()) {
  const due = await Trade.find({ ...OPEN, expiresAt: { $lte: now } }, { _id: 1 });
  for (const t of due) await closeTrade(String(t._id), "cancelled");
  return due.length;
}
