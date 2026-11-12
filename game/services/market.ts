import { getCard } from "../data/cards";
import { CONFIG } from "../config";
import { fail } from "../errors";
import { Auction, Listing, User } from "../models";
import { antiSnipe, auctionSlots, makeCode, nextMinBid } from "../rules";
import { lockCard, releaseCard, transferCard } from "./cards";
import { addCoins, getUser, spendCoins } from "./player";

const afterFee = (amount: number) => amount - Math.floor(amount * CONFIG.marketFee);

/** Last sale prices for a card, newest first: a price guide for buyers and sellers. */
export async function recentSales(slug: string, limit = 5) {
  return Listing.find({ slug, status: "sold" }, { price: 1, variant: 1, level: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(limit).lean();
}

function checkPrice(n: number, what: string) {
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000_000) fail("INVALID", `${what} must be a whole number from 1 to 1,000,000,000.`);
}

// ================= Fixed-price market =================

export async function listForSale(sellerId: string, cardCode: string, price: number) {
  checkPrice(price, "Price");
  const user = await getUser(sellerId);
  if (user.deck.includes(cardCode.toLowerCase())) fail("INVALID", "That card is in your battle deck. Remove it first.");
  const card = await lockCard(sellerId, cardCode, "listed");
  try {
    return await Listing.create({
      code: makeCode(), sellerId, cardCode: card.code, slug: card.slug, variant: card.variant, level: card.level,
      price, expiresAt: new Date(Date.now() + CONFIG.listingTtlMs),
    });
  } catch (e) {
    await releaseCard(card.code, "listed");
    throw e;
  }
}

export async function buyListing(buyerId: string, listingCode: string) {
  // Claim the listing first so two buyers can't both pay for it.
  const listing = await Listing.findOneAndUpdate(
    { code: listingCode.toLowerCase(), status: "active", expiresAt: { $gt: new Date() }, sellerId: { $ne: buyerId } },
    { status: "pending", buyerId },
    { returnDocument: "after" },
  );
  if (!listing) {
    const l = await Listing.findOne({ code: listingCode.toLowerCase() });
    return fail(l?.sellerId === buyerId ? "INVALID" : "NOT_FOUND", l?.sellerId === buyerId ? "You can't buy your own listing." : "That listing isn't for sale anymore.");
  }
  try {
    await spendCoins(buyerId, listing.price);
  } catch (e) {
    await Listing.updateOne({ _id: listing._id }, { status: "active", $unset: { buyerId: 1 } });
    throw e;
  }
  if (!(await transferCard(listing.cardCode, listing.sellerId, buyerId, "listed"))) {
    // Card vanished (shouldn't happen while listed): refund the buyer.
    await addCoins(buyerId, listing.price);
    await Listing.updateOne({ _id: listing._id }, { status: "cancelled" });
    return fail("CONFLICT", "That card is no longer available. You were refunded.");
  }
  const sellerGets = afterFee(listing.price);
  await addCoins(listing.sellerId, sellerGets);
  await Listing.updateOne({ _id: listing._id }, { status: "sold" });
  return { listing, card: getCard(listing.slug), sellerGets };
}

export async function cancelListing(sellerId: string, listingCode: string) {
  const l = await Listing.findOneAndUpdate({ code: listingCode.toLowerCase(), sellerId, status: "active" }, { status: "cancelled" });
  if (!l) return fail("NOT_FOUND", "You have no active listing with that code.");
  await releaseCard(l.cardCode, "listed");
  return getCard(l.slug);
}

/** Active listings. `slugs` narrows to those cards (web search/filters); `sort`: cheapest first by default. */
export async function searchListings(opts: { slug?: string; slugs?: string[]; sellerId?: string; limit?: number; sort?: "price" | "-price" | "new" } = {}) {
  const slugFilter = opts.slug ? { slug: opts.slug } : opts.slugs ? { slug: { $in: opts.slugs } } : {};
  const sort = opts.sort === "-price" ? "-price" : opts.sort === "new" ? "-createdAt" : "price";
  return Listing.find({ status: "active", expiresAt: { $gt: new Date() }, ...slugFilter, ...(opts.sellerId && { sellerId: opts.sellerId }) })
    .sort(sort)
    .limit(opts.limit ?? 15)
    .lean();
}

/** Returns cards from expired listings to their sellers. */
export async function expireListings(now = new Date()) {
  const due = await Listing.find({ status: "active", expiresAt: { $lte: now } });
  for (const l of due) {
    const r = await Listing.updateOne({ _id: l._id, status: "active" }, { status: "expired" });
    if (r.modifiedCount) await releaseCard(l.cardCode, "listed");
  }
  return due.length;
}

// ================= Auctions =================

export async function startAuction(sellerId: string, cardCode: string, minBid: number, durationMs: number, buyout?: number, channelId?: string) {
  checkPrice(minBid, "Minimum bid");
  if (buyout !== undefined) {
    checkPrice(buyout, "Buyout");
    if (buyout <= minBid) fail("INVALID", "Buyout must be higher than the minimum bid.");
  }
  if (durationMs < CONFIG.auctionMinMs || durationMs > CONFIG.auctionMaxMs) fail("INVALID", "Duration must be between 2m and 72h (e.g. `30m`, `6h`, `2d`).");
  const user = await getUser(sellerId);
  if (user.deck.includes(cardCode.toLowerCase())) fail("INVALID", "That card is in your battle deck. Remove it first.");
  const active = await Auction.countDocuments({ sellerId, status: "active" });
  const slots = auctionSlots(user.level);
  if (active >= slots) fail("INVALID", `You can run ${slots} auctions at once (more every 10 levels).`);

  const card = await lockCard(sellerId, cardCode, "auction");
  try {
    return await Auction.create({
      code: makeCode(), sellerId, cardCode: card.code, slug: card.slug, variant: card.variant, level: card.level,
      minBid, buyout, endsAt: new Date(Date.now() + durationMs), channelId,
    });
  } catch (e) {
    await releaseCard(card.code, "auction");
    throw e;
  }
}

/**
 * Places a bid. Coins are escrowed (taken now); the previous top bidder is refunded.
 * A bid at/above buyout ends the auction immediately.
 */
export async function placeBid(bidderId: string, auctionCode: string, amount: number, now = new Date()) {
  checkPrice(amount, "Bid");
  const a = await Auction.findOne({ code: auctionCode.toLowerCase() });
  if (!a || a.status !== "active" || a.endsAt <= now) return fail("NOT_FOUND", "That auction isn't running.");
  if (a.sellerId === bidderId) fail("INVALID", "You can't bid on your own auction.");
  const min = nextMinBid(a);
  if (amount < min) fail("INVALID", `Bid at least **${min.toLocaleString()}** coins.`);
  const isBuyout = a.buyout != null && amount >= a.buyout;
  if (isBuyout) amount = a.buyout!;

  await spendCoins(bidderId, amount); // escrow
  const updated = await Auction.findOneAndUpdate(
    // Only succeeds if nobody else bid since we read it.
    { _id: a._id, status: "active", bids: a.bids, endsAt: { $gt: now } },
    { topBid: amount, topBidderId: bidderId, $inc: { bids: 1 }, endsAt: isBuyout ? now : antiSnipe(a.endsAt, now) },
    { returnDocument: "after" },
  );
  if (!updated) {
    await addCoins(bidderId, amount);
    return fail("CONFLICT", "Someone bid at the same moment. Your coins were returned. Check the new price and try again.");
  }
  if (a.topBidderId) await addCoins(a.topBidderId, a.topBid); // refund the outbid player

  const settled = isBuyout ? await settleAuction(updated._id.toString(), now) : null;
  return { auction: updated, outbidId: a.topBidderId !== bidderId ? a.topBidderId : undefined, refunded: a.topBid, isBuyout, settled };
}

export async function cancelAuction(sellerId: string, auctionCode: string) {
  const a = await Auction.findOneAndUpdate({ code: auctionCode.toLowerCase(), sellerId, status: "active", bids: 0 }, { status: "cancelled" });
  if (!a) return fail("INVALID", "You can only cancel your own running auction before anyone bids.");
  await releaseCard(a.cardCode, "auction");
  return getCard(a.slug);
}

export type AuctionResult = { code: string; slug: string; sellerId: string; winnerId?: string; price: number; sellerGets: number; channelId?: string };

/** Settles one ended auction. Safe to call twice: the status flip only succeeds once. */
export async function settleAuction(id: string, now = new Date()): Promise<AuctionResult | null> {
  const a = await Auction.findOneAndUpdate({ _id: id, status: "active", endsAt: { $lte: now } }, { status: "settled" }, { returnDocument: "after" });
  if (!a) return null;
  if (a.topBidderId) {
    if (await transferCard(a.cardCode, a.sellerId, a.topBidderId, "auction")) {
      const sellerGets = afterFee(a.topBid);
      await addCoins(a.sellerId, sellerGets);
      return { code: a.code, slug: a.slug, sellerId: a.sellerId, winnerId: a.topBidderId, price: a.topBid, sellerGets, channelId: a.channelId ?? undefined };
    }
    await addCoins(a.topBidderId, a.topBid); // card missing: refund the winner
  }
  await releaseCard(a.cardCode, "auction");
  return { code: a.code, slug: a.slug, sellerId: a.sellerId, price: 0, sellerGets: 0, channelId: a.channelId ?? undefined };
}

/** Called by the bot's ticker every few seconds. */
export async function settleDueAuctions(now = new Date()) {
  const due = await Auction.find({ status: "active", endsAt: { $lte: now } }, { _id: 1 });
  const results: AuctionResult[] = [];
  for (const { _id } of due as { _id: unknown }[]) {
    const r = await settleAuction(String(_id), now);
    if (r) results.push(r);
  }
  return results;
}

export async function listAuctions(opts: { sellerId?: string; limit?: number } = {}) {
  return Auction.find({ status: "active", ...(opts.sellerId && { sellerId: opts.sellerId }) }).sort({ endsAt: 1 }).limit(opts.limit ?? 15).lean();
}

export async function getAuction(code: string) {
  return (await Auction.findOne({ code: code.toLowerCase() }).lean()) ?? fail("NOT_FOUND", "No auction with that code.");
}

export async function usernames(ids: (string | undefined | null)[]) {
  const users = await User.find({ discordId: { $in: ids.filter((x): x is string => !!x) } }, { discordId: 1, username: 1 }).lean();
  return new Map(users.map((u) => [u.discordId, u.username]));
}
