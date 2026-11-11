import type { Element, Rarity } from "./data/cards";

const MIN = 60_000;
const HOUR = 60 * MIN;

export const CONFIG = {
  prefix: "bd",
  starterCoins: 500,

  dailyCoins: 250,
  dailyCooldownMs: 22 * HOUR,
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
  common: 679, // rare+ odds halved (was 600/250/100/35/10/4/1)
  uncommon: 250,
  rare: 50,
  epic: 15,
  legendary: 4,
  mythic: 1.5,
  secret: 0.5,
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
  secret: "⚫",
};

export const VARIANTS = [
  { code: "normal", name: "Normal", mult: 1, weight: 100 },
  { code: "foil", name: "Foil", mult: 1.5, weight: 12 },
  { code: "golden", name: "Golden", mult: 2, weight: 6 },
  { code: "shadow", name: "Shadow", mult: 2.2, weight: 5 },
  { code: "crystal", name: "Crystal", mult: 2.5, weight: 4 },
  { code: "rainbow", name: "Rainbow", mult: 3, weight: 2 },
  { code: "celestial", name: "Celestial", mult: 4, weight: 1 },
  { code: "royal", name: "Royal", mult: 5, weight: 0.5 },
] as const;
export type Variant = (typeof VARIANTS)[number]["code"];
export const variantInfo = (code: string) => VARIANTS.find((v) => v.code === code) ?? VARIANTS[0];

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
