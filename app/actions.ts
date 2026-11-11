"use server";
// Every action gets the player from the session (requireUid). Never trust a player id from the form.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { GameError } from "@/game/errors";
import { getCard } from "@/game/data/cards";
import { cardStats, nextMinBid, parseDuration, type Fighter } from "@/game/rules";
import * as player from "@/game/services/player";
import * as cards from "@/game/services/cards";
import * as market from "@/game/services/market";
import * as trade from "@/game/services/trade";
import * as battle from "@/game/services/battle";
import { CONFIG } from "@/game/config";
import { requireUid } from "./lib/session";

/** Runs a game action, then redirects back with ?ok= or ?err= so the page can show the result. */
async function run(path: string, fn: (uid: string) => Promise<string | { ok: string; extra: Record<string, string | string[]> }>) {
  const uid = await requireUid();
  const query = new URLSearchParams();
  try {
    const r = await fn(uid);
    const { ok, extra } = typeof r === "string" ? { ok: r, extra: {} } : r;
    query.set("ok", ok);
    for (const [k, v] of Object.entries(extra)) for (const x of [v].flat()) query.append(k, x);
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    query.set("err", e.message);
  }
  query.set("t", String(Date.now())); // unique per result, lets pages reset client state
  revalidatePath("/", "layout"); // header status (coins, energy, level) + this page
  redirect(`${path}?${query}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k).replace(/,/g, ""));

// ---- Confirmed-result actions for the animated scenes ----
// These return the server-confirmed outcome as data (no redirect), so a scene can play neutral feedback while
// pending and the reward effect only after confirmation. revalidatePath refreshes the rest of the page.
export type Played<T> = { ok: true; data: T } | { ok: false; error: string };
async function play<T>(path: string, fn: (uid: string) => Promise<T>): Promise<Played<T>> {
  const uid = await requireUid();
  try {
    const data = await fn(uid);
    revalidatePath("/", "layout"); // header status (coins, energy, level) + this page
    return { ok: true, data };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return { ok: false, error: e.message };
  }
}
const fighter = (f?: Fighter & { variant?: string }) =>
  f ? { slug: f.def.slug, name: f.def.name, rarity: f.def.rarity, element: f.def.element, level: f.level, code: f.code, variant: f.variant ?? "normal", ...cardStats(f.def, f.level) } : null;

export async function huntPlay(count = 1) {
  if (!player.HUNT_BATCHES.includes(count as 1)) return { ok: false as const, error: "Hunt 1, 5 or 10 at a time." };
  return play("/profile", async (uid) => {
    const h = await player.huntMany(uid, count);
    return {
      cards: h.cards.map((c) => ({ card: { code: c.code, slug: c.card.slug, variant: c.variant, level: 1 }, name: c.card.name, rarity: c.card.rarity, pity: c.pity, clover: c.clover })),
      leveledUp: h.leveledUp, level: h.level, energy: h.energy, max: h.maxEnergy,
    };
  });
}

export async function workPlay() {
  return play("/profile", async (uid) => {
    const w = await player.work(uid);
    return { coins: w.coins, energy: w.energy, max: w.maxEnergy, leveledUp: w.leveledUp, level: w.level };
  });
}
export async function battlePlay() {
  return play("/battle", async (uid) => {
    const r = await battle.randomFight(uid);
    return {
      lanes: r.lanes.map((l) => ({ a: fighter(l.a), b: fighter(l.b), pa: l.pa, pb: l.pb, winner: l.winner })),
      winner: r.winner, opponent: r.opponent.username || "a wild player",
      coins: r.winner === "a" ? CONFIG.battleWinCoins : r.winner === "b" ? CONFIG.battleLossCoins : 0,
      leveledUp: !!r.lvl?.leveledUp, level: r.lvl?.level,
    };
  });
}
export async function combinePlay(codes: string[]) {
  // Trust boundary: the client sends the codes, so check their shape before the service validates ownership.
  if (!Array.isArray(codes) || codes.length > 10 || !codes.every((c) => typeof c === "string")) return { ok: false as const, error: "Pick 3 cards." };
  return play("/combine", async (uid) => {
    const r = await cards.combine(uid, codes);
    return r.success
      ? { success: true as const, from: r.from, chance: r.chance, card: { code: r.code, slug: r.card.slug, variant: r.variant, level: 1 }, name: r.card.name, rarity: r.card.rarity }
      : { success: false as const, from: r.from, chance: r.chance, kept: r.kept, name: r.keptCard.name };
  });
}
export async function burrowCollectPlay() {
  return play("/burrow", async (uid) => ({ coins: await cards.burrowCollect(uid) }));
}
export async function bidPlay(code: string, amount: number) {
  if (typeof code !== "string" || !Number.isFinite(amount)) return { ok: false as const, error: "Invalid bid." };
  return play("/auctions", async (uid) => {
    const r = await market.placeBid(uid, code, Math.floor(amount));
    return { topBid: r.auction.topBid, bids: r.auction.bids, endsAt: r.auction.endsAt.getTime(), nextMin: nextMinBid(r.auction), isBuyout: r.isBuyout, settled: !!r.settled };
  });
}

export async function login() {
  await signIn("discord", { redirectTo: "/profile" });
}
export async function logout() {
  await signOut({ redirectTo: "/" });
}

// ---- Battle ----
export async function setDeckAction(f: FormData) {
  await run("/battle", async (uid) => `Deck saved (${(await cards.setDeck(uid, f.getAll("codes").map(String))).length} cards).`);
}
export async function npcSellAction(f: FormData) {
  await run("/collection", async (uid) => {
    const r = await cards.npcSell(uid, str(f, "code"));
    return { ok: `Sold ${r.card.name} to the shop for ${r.coins} coins`, extra: { fx: "sell" } };
  });
}
export async function dailyAction() {
  await run("/profile", async (uid) => `Daily claimed: ${(await player.daily(uid)).coins} coins + 2 carrots, energy refilled`);
}
export async function buyItemAction(f: FormData) {
  await run("/profile", async (uid) => {
    const r = await player.buyItem(uid, str(f, "item"), num(f, "qty") || 1);
    return `Bought ${r.item.name} ×${r.qty}`;
  });
}
export async function useItemAction(f: FormData) {
  await run("/profile", async (uid) => player.consumeItem(uid, str(f, "item")));
}

// ---- Collection ----
export async function feedCarrotAction(f: FormData) {
  await run("/collection", async (uid) => {
    const r = await cards.feed(uid, str(f, "code"), { item: str(f, "item") || "carrot", qty: num(f, "qty") || 1 });
    return `${r.card.name} gained ${r.gained} XP → Lv ${r.level}`;
  });
}
export async function burrowAddAction(f: FormData) {
  await run("/collection", async (uid) => `${(await cards.burrowAdd(uid, str(f, "code"))).name} moved into your burrow`);
}
export async function marketSellAction(f: FormData) {
  await run("/collection", async (uid) => {
    const l = await market.listForSale(uid, str(f, "code"), num(f, "price"));
    return `Listed ${getCard(l.slug).name} for ${l.price} (listing ${l.code})`;
  });
}
export async function auctionStartAction(f: FormData) {
  await run("/collection", async (uid) => {
    const ms = parseDuration(str(f, "duration")) ?? 0;
    const buyout = num(f, "buyout") || undefined;
    const a = await market.startAuction(uid, str(f, "code"), num(f, "minBid"), ms, buyout);
    return `Auction ${a.code} started for ${getCard(a.slug).name}`;
  });
}

// ---- Burrow ----
export async function burrowRemoveAction(f: FormData) {
  await run("/burrow", async (uid) => {
    const r = await cards.burrowRemove(uid, str(f, "code"));
    return `${r.card.name} left the burrow (+${r.coins} coins)`;
  });
}

// ---- Market ----
export async function marketBuyAction(f: FormData) {
  await run("/market", async (uid) => {
    const r = await market.buyListing(uid, str(f, "code"));
    return { ok: `You bought ${r.card.name} for ${r.listing.price} coins`, extra: { fx: "buy" } };
  });
}
export async function marketCancelAction(f: FormData) {
  await run("/market", async (uid) => `${(await market.cancelListing(uid, str(f, "code"))).name} returned to your collection`);
}

// ---- Auctions ----
export async function auctionCancelAction(f: FormData) {
  await run("/auctions", async (uid) => `${(await market.cancelAuction(uid, str(f, "code"))).name} returned to your collection`);
}

// ---- Trades (started in Discord, managed here too) ----
export async function tradeAcceptAction(f: FormData) {
  await run("/trades", async (uid) => {
    await trade.acceptTrade(uid, str(f, "code"));
    return "Trade accepted. Add cards or coins, then confirm.";
  });
}
export async function tradeConfirmAction(f: FormData) {
  await run("/trades", async (uid) => ((await trade.confirmTrade(uid, str(f, "code"))).settled ? "Trade complete!" : "Confirmed. Waiting for your partner."));
}
export async function tradeCancelAction(f: FormData) {
  await run("/trades", async (uid) => {
    await trade.cancelTrade(uid, str(f, "code"));
    return "Trade cancelled";
  });
}
export async function tradeCoinsAction(f: FormData) {
  await run("/trades", async (uid) => {
    await trade.setTradeCoins(uid, num(f, "coins"));
    return "Coins updated";
  });
}
export async function tradeAddCardAction(f: FormData) {
  await run("/trades", async (uid) => {
    await trade.addTradeCard(uid, str(f, "card"));
    return "Card added";
  });
}
