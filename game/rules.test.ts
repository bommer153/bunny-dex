import { test } from "node:test";
import assert from "node:assert/strict";
import { getCard, CARDS, RARITIES } from "./data/cards";
import { COMBINE_CHANCE, CONFIG, LEVEL_CAP } from "./config";
import {
  antiSnipe, applyCardXp, burrowEarnings, cardStats, energyNow, energyWaitMs, isRarePlus, makeCode, maxEnergy, msUntilShopReset, nextMinBid, parseDuration, shopDay,
  autoPick, nextRarity, playerLevel, resolveBattle, spareCards, rollCombine, rollHunt, rollRarity, xpToNextPlayerLevel,
  completedSets, dailyQuests, nextStreak, setTitle, streakCoins, streakDay, weekKey, huntXp, lanePower, teamBonus, towerReward, towerTeam,
} from "./rules";

/** Deterministic RNG (mulberry32). */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test("pity always gives rare or better", () => {
  const rng = seeded(1);
  for (let i = 0; i < 500; i++) assert.ok(isRarePlus(rollRarity(rng, { pity: true })));
});

test("clover raises rare+ rate", () => {
  const rate = (clover: boolean) => {
    const rng = seeded(7);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (isRarePlus(rollRarity(rng, { clover }))) n++;
    return n / 20000;
  };
  const base = rate(false), boosted = rate(true);
  assert.ok(base > 0.05 && base < 0.09, `base ${base}`);
  assert.ok(boosted > base * 1.6, `boosted ${boosted} vs ${base}`);
});

test("hunt returns a real card of a valid variant", () => {
  const rng = seeded(3);
  for (let i = 0; i < 200; i++) {
    const { card, variant } = rollHunt(rng);
    assert.ok(CARDS.includes(card));
    assert.ok(variant);
  }
});

test("player level from total xp", () => {
  assert.deepEqual(playerLevel(0), { level: 1, into: 0, need: 100 });
  assert.equal(playerLevel(99).level, 1);
  assert.equal(playerLevel(100).level, 2);
  assert.equal(playerLevel(100 + xpToNextPlayerLevel(2)).level, 3);
});

test("card xp levels up and stops at the rarity cap", () => {
  const r = applyCardXp({ level: 1, xp: 0 }, "common", 60); // needs 50 for L2
  assert.deepEqual(r, { level: 2, xp: 10, capped: false });
  const capped = applyCardXp({ level: 1, xp: 0 }, "common", 1_000_000);
  assert.equal(capped.level, LEVEL_CAP.common);
  assert.equal(capped.xp, 0);
  assert.ok(capped.capped);
});

test("stats scale 5% per level", () => {
  const c = getCard("meadow-hop");
  assert.deepEqual(cardStats(c, 1), { atk: c.atk, def: c.def, hp: c.hp });
  assert.equal(cardStats(c, 21).hp, Math.round(c.hp * 2));
});

test("burrow earnings cap at max hours and ignore negative time", () => {
  const c = getCard("meadow-hop"); // common: 10/h
  const t0 = new Date("2026-01-01T00:00:00Z");
  const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);
  assert.equal(burrowEarnings(c, 1, t0, h(2)), 20);
  assert.equal(burrowEarnings(c, 1, t0, h(100)), 10 * CONFIG.burrowMaxHours);
  assert.equal(burrowEarnings(c, 1, h(5), t0), 0);
});

test("battle: stronger team wins, empty lanes lose", () => {
  const strong = [getCard("eclipse-empress"), getCard("polar-sovereign"), getCard("cinder-monarch")].map((def, i) => ({ def, level: 10, code: `s${i}` }));
  const weak = [getCard("meadow-hop")].map((def) => ({ def, level: 1, code: "w0" }));
  const r = resolveBattle(strong, weak, seeded(5));
  assert.equal(r.winner, "a");
  assert.equal(r.lanes[1].winner, "a"); // weak has no lane 2 card
});

test("auction: first bid is minBid, then +5%", () => {
  assert.equal(nextMinBid({ topBid: 0, minBid: 100, bids: 0 }), 100);
  assert.equal(nextMinBid({ topBid: 100, minBid: 100, bids: 1 }), 105);
  assert.equal(nextMinBid({ topBid: 101, minBid: 100, bids: 1 }), 107); // rounds up
});

test("auction: late bids extend the end time", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const far = new Date(now.getTime() + 3_600_000);
  assert.equal(antiSnipe(far, now), far);
  const soon = new Date(now.getTime() + 30_000);
  assert.equal(antiSnipe(soon, now).getTime(), now.getTime() + CONFIG.auctionAntiSnipeMs);
});

test("parseDuration", () => {
  assert.equal(parseDuration("2m"), 120_000);
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("1d"), 86_400_000);
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration("5x"), null);
  assert.equal(parseDuration("2m junk"), null);
});

test("energy: missing = full, regen +1/min keeps partial progress, caps at max", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const MIN = CONFIG.energyRegenMs;
  assert.deepEqual(energyNow(undefined, undefined, 50, t0), { energy: 50, anchor: t0, nextInMs: 0 });

  const e = energyNow(10, t0, 50, at(2.5 * MIN)); // 2 full ticks, half a tick of progress kept
  assert.equal(e.energy, 12);
  assert.equal(e.anchor.getTime(), at(2 * MIN).getTime());
  assert.equal(e.nextInMs, 0.5 * MIN);

  assert.equal(energyNow(10, t0, 50, at(1000 * MIN)).energy, 50); // capped
  assert.equal(energyNow(70, t0, 50, at(1000 * MIN)).energy, 70); // juice overflow: no regen, no loss
  assert.equal(energyWaitMs({ energy: 12, nextInMs: 0.5 * MIN }, 15), 2.5 * MIN);
  assert.equal(energyWaitMs({ energy: 20, nextInMs: MIN }, 5), 0);
});

test("max energy grows with level up to the cap", () => {
  assert.equal(maxEnergy(1), CONFIG.energyBase);
  assert.equal(maxEnergy(11), CONFIG.energyBase + 10 * CONFIG.energyPerLevel);
  assert.equal(maxEnergy(10_000), CONFIG.energyCap);
});

test("combine: chance drops each rarity, success gives the next rarity, secret can't combine", () => {
  const ups = RARITIES.filter((r) => nextRarity(r));
  for (let i = 1; i < ups.length; i++) assert.ok(COMBINE_CHANCE[ups[i]] < COMBINE_CHANCE[ups[i - 1]], ups[i]);
  const rng = seeded(11);
  let wins = 0;
  for (let i = 0; i < 5000; i++) {
    const r = rollCombine("rare", rng);
    if (r.success) { wins++; assert.equal(r.card.rarity, "epic"); }
  }
  assert.ok(Math.abs(wins / 5000 - COMBINE_CHANCE.rare) < 0.03, `${wins}`);
  assert.equal(rollCombine("secret", () => 0).success, false);
});

test("codes are 6 chars base36", () => {
  for (let i = 0; i < 100; i++) assert.match(makeCode(), /^[0-9a-z]{6}$/);
});

test("shop day resets at midnight Manila time (UTC+8)", () => {
  assert.equal(shopDay(new Date("2026-11-10T15:59:00Z")), "2026-11-10"); // 23:59 Manila
  assert.equal(shopDay(new Date("2026-11-10T16:00:00Z")), "2026-11-11"); // 00:00 Manila
  const left = msUntilShopReset(new Date("2026-11-10T15:00:00Z")); // 23:00 Manila → 1h
  assert.ok(Math.abs(left - 3_600_000) <= 1000, `${left}`);
});

test("auto combine: keeps your best copy of each bunny, picks cheapest spares of the lowest rarity", () => {
  const [a, b] = CARDS.filter((c) => c.rarity === "common");
  const rare = CARDS.find((c) => c.rarity === "rare")!;
  const mk = (code: string, slug: string, level = 1) => ({ code, slug, level, variant: "normal" });
  const cards = [mk("a1", a.slug, 5), mk("a2", a.slug), mk("a3", a.slug, 2), mk("b1", b.slug), mk("b2", b.slug), mk("r1", rare.slug), mk("r2", rare.slug)];
  const spare = spareCards(cards).map((c) => c.code);
  assert.equal(spare.length, 4, `${spare}`); // keeps a1 (best a), one b and one rare
  assert.ok(!spare.includes("a1"));
  const picked = autoPick(cards)!.map((c) => c.code);
  assert.ok(picked.includes("a2") && picked.includes("a3") && picked.some((x) => x.startsWith("b")), `${picked}`);
  assert.equal(autoPick(cards, "rare"), null); // only one spare rare
  assert.equal(autoPick([mk("x", a.slug), mk("y", b.slug), mk("z", a.slug)]), null);
});

test("every card has art in public/cards", async () => {
  const { existsSync } = await import("node:fs");
  const missing = CARDS.filter((c) => !existsSync(`public/cards/${c.slug}.png`)).map((c) => c.slug);
  assert.deepEqual(missing, [], "run: npx tsx scripts/placeholder-art.ts");
  assert.equal(new Set(CARDS.map((c) => c.slug)).size, CARDS.length, "duplicate slug");
});

test("daily streak grows within the grace window, resets after, and cycles every 7 days", () => {
  const now = new Date("2026-05-10T12:00:00Z");
  const h = 3_600_000;
  assert.equal(nextStreak(undefined, 0, now), 1);
  assert.equal(nextStreak(new Date(now.getTime() - 23 * h), 4, now), 5);
  assert.equal(nextStreak(new Date(now.getTime() - 49 * h), 4, now), 1);
  assert.deepEqual([1, 6, 7, 8, 14, 15].map(streakDay), [1, 6, 7, 1, 7, 1]);
  assert.equal(streakCoins(1), CONFIG.dailyCoins);
  assert.ok(streakCoins(7) > streakCoins(6));
});

test("daily quests: 3 distinct, stable within a day, and the week starts Monday", () => {
  const q = dailyQuests("u1", "2026-05-10");
  assert.equal(new Set(q.map((x) => x.id)).size, 3);
  assert.deepEqual(dailyQuests("u1", "2026-05-10"), q);
  assert.equal(weekKey("2026-05-10"), "2026-05-04"); // Sunday → previous Monday
  assert.equal(weekKey("2026-05-11"), "2026-05-11"); // Monday → itself
});

test("element sets complete only with every card of that element", () => {
  const fire = CARDS.filter((c) => c.element === "fire").map((c) => c.slug);
  assert.deepEqual(completedSets(new Set(fire)), ["fire"]);
  assert.deepEqual(completedSets(new Set(fire.slice(1))), []);
  assert.equal(setTitle("fire"), "Fire Keeper");
});

test("battle traits, team bonus and variants change lane power", () => {
  const byEl = (el: string) => CARDS.find((c) => c.element === el && c.rarity === "common")!;
  const f = (el: string, variant = "normal") => ({ def: byEl(el), level: 1, code: el, variant });
  const elec = f("electric");
  assert.ok(lanePower(elec, undefined, 0) > lanePower(elec, undefined, 1)); // Surge: lane 1 only
  assert.ok(lanePower(f("fire", "royal"), undefined) > lanePower(f("fire"), undefined)); // variant bonus
  const water = f("water");
  assert.ok(lanePower(water, f("ice")) < lanePower(water, f("fire"))); // Chill cuts attack (fire isn't ice)

  const fire2 = teamBonus([f("fire"), f("fire"), f("water")]);
  assert.deepEqual(fire2.mult.map((m) => +m.toFixed(2)), [1.05, 1.05, 1]);
  const light = teamBonus([f("light"), f("water"), f("nature")]);
  assert.deepEqual(light.mult.map((m) => +m.toFixed(2)), [1, 1.04, 1.04]); // blesses the others, not itself
});

test("hunt XP halves after the daily cap; tower floors get harder", () => {
  const cap = CONFIG.huntXpDailyCap;
  assert.equal(huntXp(0, 10), 10 * CONFIG.huntXp);
  assert.equal(huntXp(cap, 10), Math.floor((10 * CONFIG.huntXp) / 2));
  assert.equal(huntXp(cap - 5, 10), 5 * CONFIG.huntXp + Math.floor((5 * CONFIG.huntXp) / 2));
  assert.equal(towerTeam(1)[0].def.rarity, "common");
  assert.equal(towerTeam(30)[0].def.rarity, "mythic");
  assert.equal(towerTeam(3).length, CONFIG.teamSize);
  assert.equal(towerReward(5).shards, 10);
  assert.equal(towerReward(4).shards, 0);
});
