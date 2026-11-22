import { CARDS, type Element, type Rarity } from "./data/cards";

const MIN = 60_000;
const HOUR = 60 * MIN;

export const CONFIG = {
  prefix: "bd",
  starterCoins: 500,

  dailyCoins: 250,
  dailyCooldownMs: 22 * HOUR,
  streakGraceMs: 48 * HOUR, // claim again within this or the streak resets
  setRewardCoins: 1000, // one-time, for owning every card of an element
  huntXpDailyCap: 100, // hunts per day at full XP; half XP after (keeps grinders from lapping everyone)
  wishlistMax: 10,
  tutorialCoins: 500, // + 2 clovers, once, for finishing "First steps"

  // Wild spawns: chatting in a server channel sometimes makes a bunny appear for anyone to catch.
  spawnChance: 0.03, // per message
  spawnCooldownMs: 10 * MIN, // per channel
  spawnTtlMs: 2 * MIN,
  workMin: 50,
  workMax: 150,

  // Energy replaces per-command cooldowns: play in bursts, it refills while you're away.
  energyBase: 50, // max at level 1
  energyPerLevel: 1,
  energyCap: 150,
  energyRegenMs: MIN, // +1 per minute
  energyCost: { hunt: 1, work: 5, battle: 3 },
  juiceEnergy: 25,
  shopTimeZone: "Asia/Manila", // daily shop limits reset at midnight here

  huntXp: 15,
  pityHunts: 25, // guaranteed rare+ after this many hunts without one
  baitHuntsPerUse: 5,

  playerXpBase: 100,
  playerXpGrowth: 1.15,

  burrowBaseSlots: 2,
  burrowSlotsPerLevels: 5, // +1 slot every 5 player levels
  burrowMaxSlots: 10,
  burrowMaxHours: 12,

  npcSellRate: 0.4,
  marketFee: 0.05,
  listingTtlMs: 72 * HOUR,
  tradeTtlMs: 30 * MIN,

  auctionMinMs: 2 * MIN,
  auctionMaxMs: 72 * HOUR,
  auctionMinIncrement: 0.05, // next bid must be >= top * 1.05
  auctionAntiSnipeMs: 2 * MIN,
  auctionBaseSlots: 2,
  auctionSlotsPerLevels: 10,

  teamSize: 3,
  battleWinCoins: 100,
  battleLossCoins: 25,
  battleWinXp: 40,
  battleLossXp: 10,
  cardWinXp: 30,
  cardLossXp: 10,
} as const;

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 703, // rare+ cut by a third again (was 679/250/50/15/4/1.5/0.5; before that 600/250/100/35/10/4/1)
  uncommon: 250,
  rare: 33,
  epic: 10,
  legendary: 2.7,
  mythic: 1,
  secret: 0.3,
};

/** Combine: chance that `combineCount` cards of this rarity upgrade to the next one. Lower for higher rarities. */
export const COMBINE_COUNT = 3;
export const COMBINE_CHANCE: Record<Rarity, number> = {
  common: 0.7,
  uncommon: 0.5,
  rare: 0.35,
  epic: 0.2,
  legendary: 0.1,
  mythic: 0.05,
  secret: 0, // already the top
};

export const LEVEL_CAP: Record<Rarity, number> = {
  common: 10,
  uncommon: 15,
  rare: 20,
  epic: 30,
  legendary: 40,
  mythic: 50,
  secret: 50,
};

/** Burrow coins per hour at card level 1. */
export const BURROW_RATE: Record<Rarity, number> = {
  common: 10,
  uncommon: 18,
  rare: 30,
  epic: 55,
  legendary: 100,
  mythic: 180,
  secret: 300,
};

export const RARITY_EMOJI: Record<Rarity, string> = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟡",
  mythic: "🔴",
  secret: "🌈",
};

export const VARIANTS = [
  { code: "normal", name: "Normal", emoji: "", mult: 1, weight: 100 },
  { code: "foil", name: "Foil", emoji: "✨", mult: 1.5, weight: 12 },
  { code: "golden", name: "Golden", emoji: "🌟", mult: 2, weight: 6 },
  { code: "shadow", name: "Shadow", emoji: "🌑", mult: 2.2, weight: 5 },
  { code: "crystal", name: "Crystal", emoji: "💎", mult: 2.5, weight: 4 },
  { code: "rainbow", name: "Rainbow", emoji: "🌈", mult: 3, weight: 2 },
  { code: "celestial", name: "Celestial", emoji: "🌌", mult: 4, weight: 1 },
  { code: "royal", name: "Royal", emoji: "👑", mult: 5, weight: 0.5 },
] as const;
export type Variant = (typeof VARIANTS)[number]["code"];
export const variantInfo = (code: string) => VARIANTS.find((v) => v.code === code) ?? VARIANTS[0];
/** "✨ Foil " for special variants, "" for normal: put it in front of a card name. */
export const variantTag = (code: string) => (code === "normal" ? "" : `${variantInfo(code).emoji} ${variantInfo(code).name} `);
/** Special variants (not normal): the variant Dex counts each card in each of these. */
export const SPECIAL_VARIANTS = VARIANTS.filter((v) => v.code !== "normal");

/** What achievements measure, computed from the player's data (nothing extra is tracked). */
export type AchievementStats = {
  hunts: number; dex: number; rarest: number; variants: number; variantKinds: number;
  battlesWon: number; towerFloor: number; streak: number; level: number; sets: number;
};
/** One-time goals; each pays its coins once. `rarest` is a rarity index (2 rare … 6 secret). */
export const ACHIEVEMENTS: { id: string; emoji: string; name: string; desc: string; stat: keyof AchievementStats; goal: number; coins: number }[] = [
  { id: "hunt10", emoji: "🌿", name: "Sprout Seeker", desc: "Hunt 10 times", stat: "hunts", goal: 10, coins: 200 },
  { id: "hunt100", emoji: "🌿", name: "Meadow Ranger", desc: "Hunt 100 times", stat: "hunts", goal: 100, coins: 1000 },
  { id: "hunt1000", emoji: "🌿", name: "Hunt Legend", desc: "Hunt 1,000 times", stat: "hunts", goal: 1000, coins: 5000 },
  { id: "dex10", emoji: "📖", name: "Budding Collector", desc: "Own 10 different bunnies", stat: "dex", goal: 10, coins: 300 },
  { id: "dex27", emoji: "📖", name: "Halfway Dex", desc: "Own 27 different bunnies", stat: "dex", goal: 27, coins: 2000 },
  { id: "dexall", emoji: "📖", name: "Complete Dex", desc: "Own every bunny", stat: "dex", goal: CARDS.length, coins: 10000 },
  { id: "epic", emoji: "💜", name: "Epic Find", desc: "Own an epic bunny", stat: "rarest", goal: 3, coins: 500 },
  { id: "legendary", emoji: "💛", name: "Golden Moment", desc: "Own a legendary bunny", stat: "rarest", goal: 4, coins: 1500 },
  { id: "mythic", emoji: "❤️", name: "Myth Made Real", desc: "Own a mythic bunny", stat: "rarest", goal: 5, coins: 3000 },
  { id: "secret", emoji: "🔮", name: "Secret Keeper", desc: "Own a secret bunny", stat: "rarest", goal: 6, coins: 5000 },
  { id: "variant1", emoji: "✨", name: "Something Shiny", desc: "Own a special variant (foil, golden…)", stat: "variants", goal: 1, coins: 300 },
  { id: "variant25", emoji: "✨", name: "Variant Hoarder", desc: "Collect 25 bunny + variant combos", stat: "variants", goal: 25, coins: 3000 },
  { id: "variantall", emoji: "🌈", name: "Full Spectrum", desc: "Own all 7 special variants", stat: "variantKinds", goal: 7, coins: 5000 },
  { id: "win10", emoji: "⚔️", name: "Scrapper", desc: "Win 10 battles", stat: "battlesWon", goal: 10, coins: 500 },
  { id: "win100", emoji: "⚔️", name: "Champion", desc: "Win 100 battles", stat: "battlesWon", goal: 100, coins: 3000 },
  { id: "tower10", emoji: "🏰", name: "Climber", desc: "Clear Meadow Tower floor 10", stat: "towerFloor", goal: 10, coins: 500 },
  { id: "tower25", emoji: "🏰", name: "High Climber", desc: "Clear Meadow Tower floor 25", stat: "towerFloor", goal: 25, coins: 1500 },
  { id: "tower50", emoji: "🏰", name: "Sky Tower", desc: "Clear Meadow Tower floor 50", stat: "towerFloor", goal: 50, coins: 4000 },
  { id: "streak7", emoji: "🔥", name: "Regular", desc: "Reach a 7-day daily streak", stat: "streak", goal: 7, coins: 500 },
  { id: "streak30", emoji: "🔥", name: "Devoted", desc: "Reach a 30-day daily streak", stat: "streak", goal: 30, coins: 3000 },
  { id: "level10", emoji: "⭐", name: "Seasoned", desc: "Reach level 10", stat: "level", goal: 10, coins: 500 },
  { id: "level25", emoji: "⭐", name: "Veteran", desc: "Reach level 25", stat: "level", goal: 25, coins: 2000 },
  { id: "set1", emoji: "🏅", name: "Element Keeper", desc: "Complete an element set", stat: "sets", goal: 1, coins: 1000 },
  { id: "setall", emoji: "🏅", name: "Master of Elements", desc: "Complete all 7 element sets", stat: "sets", goal: 7, coins: 10000 },
];

/** Attacker element beats defender element → +25% attack. */
export const ELEMENT_ADVANTAGE: Record<Element, Element> = {
  fire: "nature",
  nature: "water",
  water: "fire",
  electric: "ice",
  ice: "shadow",
  shadow: "light",
  light: "electric",
};

/** `dailyLimit`: max buys per player per day; resets at midnight in CONFIG.shopTimeZone. */
export type ItemDef = { slug: string; name: string; price: number; description: string; dailyLimit?: number };
export const ITEMS: ItemDef[] = [
  { slug: "carrot", name: "🥕 Carrot", price: 50, description: "Feed to a card: +25 card XP." },
  { slug: "golden-carrot", name: "✨ Golden Carrot", price: 400, description: "Feed to a card: +250 card XP." },
  { slug: "clover", name: "🍀 Lucky Clover", price: 150, description: `Use: next ${CONFIG.baitHuntsPerUse} hunts have doubled rare+ odds.` },
  { slug: "burrow-key", name: "🗝️ Burrow Key", price: 2000, description: "Use: +1 permanent burrow slot." },
  { slug: "juice", name: "🧃 Carrot Juice", price: 200, description: `Use: +${CONFIG.juiceEnergy} ⚡ energy (can go over max).`, dailyLimit: 3 },
];
export const CARROT_XP: Record<string, number> = { carrot: 25, "golden-carrot": 250 };
export const itemInfo = (slug: string) => ITEMS.find((i) => i.slug === slug);

/** Daily quest pool: each player gets 3 of these per day. `id` is the counter that services bump. */
export const QUESTS = [
  { id: "hunt", goal: 10, label: "Hunt 10 times", coins: 150 },
  { id: "work", goal: 3, label: "Work 3 times", coins: 150 },
  { id: "win", goal: 2, label: "Win 2 battles", coins: 200, items: { carrot: 2 } },
  { id: "combine", goal: 1, label: "Combine cards once", coins: 150 },
  { id: "feed", goal: 2, label: "Feed your cards twice", coins: 100, items: { carrot: 1 } },
  { id: "burrow", goal: 1, label: "Collect from your burrow", coins: 100 },
] as const;
export type QuestKind = (typeof QUESTS)[number]["id"];
export const WEEKLY_QUEST = { id: "hunt", goal: 100, label: "Hunt 100 times this week", coins: 1000, items: { clover: 1 } } as const;
export type Quest = { id: QuestKind; goal: number; label: string; coins: number; items?: Partial<Record<string, number>> };

/** Every card gets its element's battle trait, so element choice matters in each lane. */
export const TRAITS: Record<Element, { name: string; desc: string }> = {
  fire: { name: "🔥 Blaze", desc: "+15% attack" },
  water: { name: "💧 Tide", desc: "+30% HP" },
  nature: { name: "🌿 Rooted", desc: "+15% defense" },
  electric: { name: "⚡ Surge", desc: "+15% power in lane 1" },
  ice: { name: "❄️ Chill", desc: "the foe in this lane has −15% attack" },
  shadow: { name: "🌑 Ambush", desc: "+20% attack vs a rarer foe" },
  light: { name: "✨ Blessing", desc: "your other lanes get +4% power" },
};

/** Shards from breaking a card down; crafting a specific card costs 10× its rarity's yield. Secret can't be crafted. */
export const SHARD_YIELD: Record<Rarity, number> = { common: 1, uncommon: 3, rare: 10, epic: 30, legendary: 100, mythic: 300, secret: 1000 };
export const craftCost = (r: Rarity) => (r === "secret" ? null : SHARD_YIELD[r] * 10);

/** Coins to re-roll a card's variant (a coin sink: it can also roll down to normal). */
export const REROLL_COST: Record<Rarity, number> = { common: 100, uncommon: 250, rare: 600, epic: 1500, legendary: 4000, mythic: 10000, secret: 25000 };

/** One-time beginner checklist. `id` matches the quest counters, so the same game actions tick it. */
export const TUTORIAL = [
  { id: "hunt", label: "Go on a hunt" },
  { id: "feed", label: "Feed one of your cards" },
  { id: "work", label: "Work once" },
  { id: "burrow", label: "Collect coins from your burrow" },
  { id: "win", label: "Win a battle" },
] as const;
