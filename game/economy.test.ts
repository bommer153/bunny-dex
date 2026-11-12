// Integration test against local MongoDB (separate bunnydex_test database, wiped each run).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDb } from "./db";
import { CONFIG } from "./config";
import { User, UserCard, Auction } from "./models";
import { buyItem, daily, ensureUser, getEnergy, hunt, huntMany, shopLimitsLeft, spendCoins, consumeItem } from "./services/player";
import { burrowAdd, burrowCollect, combine, craftCard, feed, giftCard, grantCard, lockCard, npcSell, rerollVariant, setLocked, shardCards, spareDupes } from "./services/cards";
import { towerFight } from "./services/battle";
import { bump, claimQuests } from "./services/quests";
import { CARDS } from "./data/cards";
import { buyListing, listForSale, placeBid, settleDueAuctions, startAuction } from "./services/market";
import { acceptTrade, addTradeCard, confirmTrade, createTrade, setTradeCoins } from "./services/trade";

const URI = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017/bunnydex_test";
const totalCoins = async () => (await User.find({}, { coins: 1 })).reduce((s, u) => s + u.coins, 0);
const coinsOf = async (id: string) => (await User.findOne({ discordId: id }))!.coins;

before(async () => {
  await connectDb(URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, UserCard, Auction].map((m) => m.syncIndexes()));
});
after(() => mongoose.disconnect());

test("new player gets starter coins and cards", async () => {
  const { isNew } = await ensureUser("u1", "alice");
  assert.ok(isNew);
  assert.equal(await coinsOf("u1"), CONFIG.starterCoins);
  assert.ok((await UserCard.countDocuments({ ownerId: "u1" })) >= 4);
  assert.equal((await ensureUser("u1")).isNew, false);
});

test("spending more than you have fails and changes nothing", async () => {
  await assert.rejects(spendCoins("u1", CONFIG.starterCoins + 1), /need/);
  assert.equal(await coinsOf("u1"), CONFIG.starterCoins);
  // 20 parallel spends of 100 from 500: exactly 5 succeed.
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => spendCoins("u1", 100)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(await coinsOf("u1"), 0);
  await User.updateOne({ discordId: "u1" }, { coins: 1000 });
});

test("energy: parallel hunts can't spend the same point; juice overflows; daily refills", async () => {
  await ensureUser("e1", "erin");
  // Existing-player case: no energy stored yet = full bar.
  assert.equal((await getEnergy("e1")).energy, CONFIG.energyBase);
  await User.updateOne({ discordId: "e1" }, { energy: 3, energyAt: new Date() });
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => hunt("e1")));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 3);
  assert.equal((await getEnergy("e1")).energy, 0);
  assert.match(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason.message), /Not enough energy/);

  await User.updateOne({ discordId: "e1" }, { "items.juice": 3 });
  for (let i = 0; i < 3; i++) await consumeItem("e1", "juice");
  assert.equal((await getEnergy("e1")).energy, 3 * CONFIG.juiceEnergy); // 75 > max 50: kept
  await daily("e1");
  assert.equal((await getEnergy("e1")).energy, 3 * CONFIG.juiceEnergy); // daily never lowers overflow
  await User.updateOne({ discordId: "e1" }, { energy: 1, energyAt: new Date(), lastDaily: null });
  await daily("e1");
  assert.equal((await getEnergy("e1")).energy, (await getEnergy("e1")).max);
});

test("shop daily limit: juice max 3/day, even in parallel; failed payment doesn't use a buy; new day resets", async () => {
  await ensureUser("s1", "sam");
  await User.updateOne({ discordId: "s1" }, { coins: 150 }); // can't afford juice (200)
  await assert.rejects(buyItem("s1", "juice"), /need/);
  assert.equal((await shopLimitsLeft("s1")).left.juice, 3); // reservation was given back

  await User.updateOne({ discordId: "s1" }, { coins: 10_000 });
  const r = await Promise.allSettled(Array.from({ length: 5 }, () => buyItem("s1", "juice")));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 3);
  assert.equal(await coinsOf("s1"), 10_000 - 3 * 200);
  assert.equal((await User.findOne({ discordId: "s1" }))!.items.get("juice"), 3);
  await assert.rejects(buyItem("s1", "juice"), /Daily limit reached/);
  await assert.rejects(buyItem("s1", "juice", 4), /at most 3/);
  await buyItem("s1", "carrot", 50); // unlimited items unaffected

  await User.updateOne({ discordId: "s1" }, { shopDay: "2000-01-01" }); // pretend it's a new day
  await buyItem("s1", "juice", 2);
  assert.equal((await shopLimitsLeft("s1")).left.juice, 1);
});

test("a card can't be locked into two places at once", async () => {
  const c = await grantCard("u1", "meadow-hop", "normal");
  const r = await Promise.allSettled([lockCard("u1", c.code, "burrow"), lockCard("u1", c.code, "listed")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
});

test("feeding duplicates levels a card and consumes the fodder", async () => {
  const target = await grantCard("u1", "meadow-hop", "normal");
  const food = await Promise.all([1, 2, 3].map(() => grantCard("u1", "meadow-hop", "normal")));
  const r = await feed("u1", target.code, [...food.map((f) => f.code), "nope00"]);
  assert.equal(r.gained, 30); // meadow-hop: baseValue 20 / 2 = 10 XP each
  assert.deepEqual([r.level, r.xp], [1, 30]);
  await User.updateOne({ discordId: "u1" }, { "items.carrot": 1 });
  assert.equal((await feed("u1", target.code, { item: "carrot", qty: 1 })).level, 2); // 30 + 25 ≥ 50
  assert.deepEqual(r.skipped, ["nope00"]);
  assert.equal(await UserCard.countDocuments({ code: { $in: food.map((f) => f.code) } }), 0);
});

test("burrow pays once even if collected twice at the same moment", async () => {
  await User.updateOne({ discordId: "u1" }, { coins: 0 });
  const c = await grantCard("u1", "meadow-hop", "normal");
  await burrowAdd("u1", c.code);
  await UserCard.updateOne({ code: c.code }, { burrowSince: new Date(Date.now() - 2 * 3_600_000) }); // 2h ago
  const [a, b] = await Promise.all([burrowCollect("u1"), burrowCollect("u1")]);
  assert.equal(a + b, 20); // common 10/h × 2h, paid once
  assert.equal(await coinsOf("u1"), 20);
  await User.updateOne({ discordId: "u1" }, { coins: 1000 });
});

test("market: only one of two buyers gets the card; coins conserved minus fee", async () => {
  await ensureUser("u2", "bob");
  await ensureUser("u3", "cara");
  await User.updateMany({ discordId: { $in: ["u2", "u3"] } }, { coins: 1000 });
  const card = await grantCard("u1", "meadow-hop", "foil");
  const listing = await listForSale("u1", card.code, 200);
  const before = await totalCoins();
  const r = await Promise.allSettled([buyListing("u2", listing.code), buyListing("u3", listing.code)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await totalCoins(), before - Math.floor(200 * CONFIG.marketFee));
  const owner = (await UserCard.findOne({ code: card.code }))!;
  assert.ok(["u2", "u3"].includes(owner.ownerId));
  assert.equal(owner.status, "available");
});

test("auction: escrow, outbid refund, settle to winner, coins conserved minus fee", async () => {
  await User.updateMany({ discordId: { $in: ["u1", "u2", "u3"] } }, { coins: 1000 });
  const card = await grantCard("u1", "ember-puff", "normal");
  const auction = await startAuction("u1", card.code, 100, CONFIG.auctionMinMs);
  const before = await totalCoins();

  await placeBid("u2", auction.code, 100);
  assert.equal(await coinsOf("u2"), 900); // escrowed
  await assert.rejects(placeBid("u3", auction.code, 104), /at least/); // < 105
  await placeBid("u3", auction.code, 105);
  assert.equal(await coinsOf("u2"), 1000); // refunded
  assert.equal(await coinsOf("u3"), 895);
  await assert.rejects(placeBid("u1", auction.code, 500), /own auction/);

  const results = await settleDueAuctions(new Date(Date.now() + CONFIG.auctionMaxMs)); // jump past the end
  assert.equal(results.length, 1);
  assert.equal(results[0].winnerId, "u3");
  assert.equal((await UserCard.findOne({ code: card.code }))!.ownerId, "u3");
  assert.equal(await coinsOf("u1"), 1000 + 105 - Math.floor(105 * CONFIG.marketFee));
  assert.equal(await totalCoins(), before - Math.floor(105 * CONFIG.marketFee));
  assert.equal((await settleDueAuctions(new Date(Date.now() + CONFIG.auctionMaxMs))).length, 0); // never twice
});

test("auction: racing bids at the same price, only one wins and the other is refunded", async () => {
  await User.updateMany({ discordId: { $in: ["u1", "u2", "u3"] } }, { coins: 1000 });
  const card = await grantCard("u1", "ember-puff", "normal");
  const a = await startAuction("u1", card.code, 100, CONFIG.auctionMinMs, 400);
  const before = await totalCoins();
  const r = await Promise.allSettled([placeBid("u2", a.code, 150), placeBid("u3", a.code, 150)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await totalCoins(), before - 150); // only the winning bid is held in escrow
  // buyout ends it immediately
  const buy = await placeBid("u2", a.code, 9999);
  assert.ok(buy.isBuyout);
  assert.equal(buy.settled?.winnerId, "u2");
  assert.equal(buy.settled?.price, 400);
});

test("auction: no bids returns the card to the seller", async () => {
  const card = await grantCard("u1", "ember-puff", "normal");
  await startAuction("u1", card.code, 100, CONFIG.auctionMinMs);
  await settleDueAuctions(new Date(Date.now() + CONFIG.auctionMaxMs));
  const c = (await UserCard.findOne({ code: card.code }))!;
  assert.equal(c.ownerId, "u1");
  assert.equal(c.status, "available");
});

test("trade: cards and coins swap only after both confirm; edits reset confirmation", async () => {
  await User.updateMany({ discordId: { $in: ["u1", "u2"] } }, { coins: 1000 });
  const c1 = await grantCard("u1", "meadow-hop", "golden");
  const c2 = await grantCard("u2", "ember-puff", "normal");
  const t = await createTrade("u1", "u2");
  await acceptTrade("u2", t.code);
  await addTradeCard("u1", c1.code);
  await addTradeCard("u2", c2.code);
  await setTradeCoins("u2", 300);
  assert.equal((await confirmTrade("u1")).settled, false);
  await setTradeCoins("u2", 250); // changes reset u1's confirmation
  assert.equal((await confirmTrade("u2")).settled, false);
  assert.equal((await confirmTrade("u1")).settled, true);

  assert.equal((await UserCard.findOne({ code: c1.code }))!.ownerId, "u2");
  assert.equal((await UserCard.findOne({ code: c2.code }))!.ownerId, "u1");
  assert.equal(await coinsOf("u1"), 1250);
  assert.equal(await coinsOf("u2"), 750);
});

test("combine: success upgrades rarity, failure keeps the best card, bad input changes nothing", async () => {
  await ensureUser("k1", "kai");
  const three = () => Promise.all([grantCard("k1", "meadow-hop", "normal"), grantCard("k1", "meadow-hop", "golden"), grantCard("k1", "meadow-hop", "normal")]);
  const count = () => UserCard.countDocuments({ ownerId: "k1" });

  let cs = await three();
  let n = await count();
  const win = await combine("k1", cs.map((c) => c.code), () => 0);
  assert.ok(win.success);
  assert.equal(win.card.rarity, "uncommon");
  assert.equal(win.variant, "golden"); // best input variant
  assert.equal(await count(), n - 3 + 1);

  cs = await three();
  n = await count();
  const lose = await combine("k1", cs.map((c) => c.code), () => 0.999);
  assert.ok(!lose.success);
  assert.equal(lose.kept, cs[1].code); // the golden one is worth most
  assert.equal(await count(), n - 2);

  cs = await three();
  n = await count();
  const other = await grantCard("k1", CARDS.find((c) => c.rarity === "rare")!.slug, "normal");
  await assert.rejects(combine("k1", [cs[0].code, cs[1].code, other.code]), /same rarity/);
  await assert.rejects(combine("k1", [cs[0].code, cs[0].code, cs[1].code]), /exactly 3/);
  await lockCard("k1", cs[2].code, "burrow");
  await assert.rejects(combine("k1", cs.map((c) => c.code)), /Not available/);
  assert.equal(await count(), n + 1); // nothing consumed
});

test("multi-hunt: ×5 spends 5 energy for 5 cards; ×10 without enough energy changes nothing; pity carries across rolls", async () => {
  await ensureUser("h1", "hana");
  const cardsOf = () => UserCard.countDocuments({ ownerId: "h1" });
  const before = await cardsOf();
  await User.updateOne({ discordId: "h1" }, { energy: 12, energyAt: new Date() });
  const r = await huntMany("h1", 5);
  assert.equal(r.cards.length, 5);
  assert.equal(await cardsOf(), before + 5);
  assert.equal((await getEnergy("h1")).energy, 7);
  assert.equal((await User.findOne({ discordId: "h1" }))!.stats?.hunts, 5);

  await assert.rejects(huntMany("h1", 10), /Not enough energy/);
  assert.equal(await cardsOf(), before + 5); // nothing granted
  assert.equal((await getEnergy("h1")).energy, 7); // nothing spent
  await assert.rejects(huntMany("h1", 3), /at a time/);

  // Pity: one short of the pity line, a ×5 must contain a rare+ (the first roll is the pity roll).
  await User.updateOne({ discordId: "h1" }, { energy: 50, energyAt: new Date(), huntsSinceRare: CONFIG.pityHunts - 1 });
  const p = await huntMany("h1", 5, () => 0.999); // worst luck otherwise
  assert.ok(p.cards[0].pity && ["rare", "epic", "legendary", "mythic", "secret"].includes(p.cards[0].card.rarity));
});

test("locked cards can't be fed, combined, sold or listed, but can still be burrowed", async () => {
  await ensureUser("lk", "locky");
  const slug = CARDS.find((c) => c.rarity === "common")!.slug;
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => grantCard("lk", slug, "normal")));
  await setLocked("lk", a.code, true);
  await assert.rejects(combine("lk", [a.code, b.code, c.code]), /unlocked/);
  await assert.rejects(feed("lk", b.code, [a.code]), /unlocked/);
  await assert.rejects(npcSell("lk", a.code), /unlocked/);
  await assert.rejects(listForSale("lk", a.code, 100), /locked/);
  assert.ok(await UserCard.exists({ code: a.code })); // nothing touched it
  await burrowAdd("lk", a.code);
  await setLocked("lk", c.code, false);
});

test("daily streak pays more on day 2 and quests count progress then pay once", async () => {
  await ensureUser("qs", "questy");
  const d1 = await daily("qs");
  assert.equal(d1.streak, 1);
  await User.updateOne({ discordId: "qs" }, { lastDaily: new Date(Date.now() - 23 * 3_600_000) });
  const d2 = await daily("qs");
  assert.equal(d2.streak, 2);
  assert.ok(d2.coins > d1.coins);

  await bump("qs", "hunt", 100); // finishes the weekly (and the daily hunt quest if rolled)
  const before = await coinsOf("qs");
  const { got } = await claimQuests("qs");
  assert.ok(got.some((q) => q.scope === "week"));
  assert.ok((await coinsOf("qs")) > before);
  await assert.rejects(claimQuests("qs"), /No finished quests/); // second claim pays nothing
});

test("shards: break dupes keeps your best copy, craft spends shards, double-spend is blocked", async () => {
  await ensureUser("sh", "shardy");
  await UserCard.deleteMany({ ownerId: "sh" });
  const slug = CARDS.find((c) => c.rarity === "common")!.slug;
  const best = await grantCard("sh", slug, "normal", 5);
  for (let i = 0; i < 4; i++) await grantCard("sh", slug, "normal");
  const dupes = await spareDupes("sh");
  assert.equal(dupes.length, 4);
  assert.ok(!dupes.some((d) => d.code === best.code));
  const r = await shardCards("sh", dupes.map((d) => d.code));
  assert.equal(r.shards, 4);
  await User.updateOne({ discordId: "sh" }, { $inc: { shards: 6 } }); // 10 = one common craft
  await craftCard("sh", slug);
  await assert.rejects(craftCard("sh", slug), /shards/);
  assert.equal((await User.findOne({ discordId: "sh" }))!.shards, 0);
});

test("gift moves an unlocked card; reroll charges and can refund-free fail on locked", async () => {
  await ensureUser("g1", "giver");
  await ensureUser("g2", "taker");
  const c = await grantCard("g1", CARDS[0].slug, "normal");
  await setLocked("g1", c.code, true);
  await assert.rejects(giftCard("g1", "g2", c.code), /unlocked/);
  await assert.rejects(rerollVariant("g1", c.code), /unlocked/);
  await setLocked("g1", c.code, false);
  await giftCard("g1", "g2", c.code);
  assert.equal((await UserCard.findOne({ code: c.code }))!.ownerId, "g2");
  await User.updateOne({ discordId: "g2" }, { coins: 1000 });
  const r = await rerollVariant("g2", c.code, () => 0); // rng 0 → first variant (normal)
  assert.equal(r.variant, "normal");
  assert.equal(await coinsOf("g2"), 1000 - r.cost);
});

test("tower: a win clears the floor once; First steps pays once when every step is done", async () => {
  await ensureUser("tw", "climber");
  const r = await towerFight("tw", () => 0.99); // strong roll vs floor 1 commons
  if (r.winner === "a") {
    assert.equal((await User.findOne({ discordId: "tw" }))!.towerFloor, 1);
    assert.ok(r.reward && r.reward.coins > 0);
  }
  for (const k of ["hunt", "feed", "work", "burrow", "win"] as const) await bump("tw", k);
  const first = await claimQuests("tw");
  assert.ok(first.tutorialPaid);
  const again = await claimQuests("tw").catch(() => ({ tutorialPaid: false }));
  assert.equal(again.tutorialPaid, false);
});

test("players from before the tower/quests update (fields missing in the DB) still climb and get paid", async () => {
  await ensureUser("old", "veteran");
  await User.collection.updateOne({ discordId: "old" }, { $unset: { towerFloor: "", tutorialDone: "" } });
  const r1 = await towerFight("old", () => 0.99);
  assert.equal(r1.floor, 1);
  if (r1.winner === "a") {
    assert.ok(r1.reward, "first win pays");
    assert.equal((await towerFight("old", () => 0.99)).floor, 2, "next climb is floor 2, not floor 1 again");
  }
  for (const k of ["hunt", "feed", "work", "burrow", "win"] as const) await bump("old", k);
  assert.ok((await claimQuests("old")).tutorialPaid);
});
