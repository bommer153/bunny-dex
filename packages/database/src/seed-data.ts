import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { connectDatabase, disconnectDatabase } from "./connection.js";
import { CardDefinition } from "./models/card.js";
import { CardVariant } from "./models/card.js";
import { ItemDefinition, LootTable, Pack } from "./models/items.js";
import { ShopOffer } from "./models/economy.js";
import { Quest, Achievement, CollectionSet } from "./models/progression.js";
import { GameConfig } from "./models/system.js";
import { DEFAULT_GAME_CONFIG } from "@bunnydex/config";
import type { Element, Rarity, Variant } from "@bunnydex/types";

export const VARIANTS_SEED: Array<{
  code: Variant;
  displayName: string;
  valueMultiplier: number;
  huntWeightMod: number;
  cosmeticOnly: boolean;
}> = [
  { code: "normal", displayName: "Normal", valueMultiplier: 1, huntWeightMod: 100, cosmeticOnly: true },
  { code: "foil", displayName: "Foil", valueMultiplier: 1.5, huntWeightMod: 12, cosmeticOnly: true },
  { code: "golden", displayName: "Golden", valueMultiplier: 2, huntWeightMod: 6, cosmeticOnly: true },
  { code: "shadow", displayName: "Shadow", valueMultiplier: 2.2, huntWeightMod: 5, cosmeticOnly: true },
  { code: "crystal", displayName: "Crystal", valueMultiplier: 2.5, huntWeightMod: 4, cosmeticOnly: true },
  { code: "rainbow", displayName: "Rainbow", valueMultiplier: 3, huntWeightMod: 2, cosmeticOnly: true },
  { code: "celestial", displayName: "Celestial", valueMultiplier: 4, huntWeightMod: 1, cosmeticOnly: true },
  { code: "royal", displayName: "Royal", valueMultiplier: 5, huntWeightMod: 0.5, cosmeticOnly: true },
];

type CardSeed = {
  slug: string;
  name: string;
  description: string;
  rarity: Rarity;
  element: Element;
  atk: number;
  def: number;
  hp: number;
  baseValue: number;
  setId: string;
  flags?: { isStarter?: boolean };
  abilities?: Array<{ id: string; name: string; description: string }>;
};

export const CARDS: CardSeed[] = [
  // Meadow — starters & commons
  {
    slug: "meadow-hop",
    name: "Meadow Hop",
    description: "A curious starter bunny from the soft meadows.",
    rarity: "common",
    element: "nature",
    atk: 2,
    def: 2,
    hp: 8,
    baseValue: 20,
    setId: "meadow",
    flags: { isStarter: true },
  },
  {
    slug: "dewdrop-ears",
    name: "Dewdrop Ears",
    description: "Water beads dance on its silky ears.",
    rarity: "common",
    element: "water",
    atk: 2,
    def: 3,
    hp: 7,
    baseValue: 22,
    setId: "meadow",
    flags: { isStarter: true },
  },
  {
    slug: "spark-whisk",
    name: "Spark Whisk",
    description: "Tiny sparks flicker from its whiskers.",
    rarity: "common",
    element: "electric",
    atk: 3,
    def: 1,
    hp: 6,
    baseValue: 24,
    setId: "meadow",
    flags: { isStarter: true },
  },
  {
    slug: "willow-guard",
    name: "Willow Guard",
    description: "Sturdy defender of the meadow paths.",
    rarity: "common",
    element: "nature",
    atk: 1,
    def: 4,
    hp: 10,
    baseValue: 18,
    setId: "meadow",
    flags: { isStarter: true },
  },
  {
    slug: "pebble-paw",
    name: "Pebble Paw",
    description: "Collects shiny stones for no clear reason.",
    rarity: "common",
    element: "nature",
    atk: 2,
    def: 2,
    hp: 7,
    baseValue: 18,
    setId: "meadow",
  },
  {
    slug: "brook-bouncer",
    name: "Brook Bouncer",
    description: "Splashes joyfully through shallow streams.",
    rarity: "common",
    element: "water",
    atk: 2,
    def: 2,
    hp: 8,
    baseValue: 20,
    setId: "meadow",
  },
  {
    slug: "frost-nibble",
    name: "Frost Nibble",
    description: "Leaves icy footprints on summer grass.",
    rarity: "uncommon",
    element: "ice",
    atk: 3,
    def: 4,
    hp: 10,
    baseValue: 48,
    setId: "meadow",
  },
  {
    slug: "lantern-lop",
    name: "Lantern Lop",
    description: "Carries a soft glow for night trails.",
    rarity: "uncommon",
    element: "light",
    atk: 3,
    def: 3,
    hp: 9,
    baseValue: 50,
    setId: "meadow",
  },
  {
    slug: "shade-thumper",
    name: "Shade Thumper",
    description: "Hops between moonbeams unseen.",
    rarity: "rare",
    element: "shadow",
    atk: 6,
    def: 3,
    hp: 11,
    baseValue: 120,
    setId: "meadow",
    abilities: [
      { id: "sneak", name: "Sneak Hop", description: "+1 score in shadow lanes." },
    ],
  },
  {
    slug: "sunflare-bun",
    name: "Sunflare Bun",
    description: "Radiates soft dawn light.",
    rarity: "rare",
    element: "light",
    atk: 5,
    def: 5,
    hp: 12,
    baseValue: 130,
    setId: "meadow",
  },
  {
    slug: "aurora-myth",
    name: "Aurora Myth",
    description: "Said to appear only under northern lights.",
    rarity: "mythic",
    element: "ice",
    atk: 13,
    def: 10,
    hp: 22,
    baseValue: 2000,
    setId: "meadow",
  },
  {
    slug: "void-carrot",
    name: "Void Carrot",
    description: "A secret harvest from nowhere.",
    rarity: "secret",
    element: "shadow",
    atk: 15,
    def: 12,
    hp: 25,
    baseValue: 5000,
    setId: "meadow",
  },

  // Ember Grove — fire & storm
  {
    slug: "ember-puff",
    name: "Ember Puff",
    description: "Warm ash trails wherever it bounds.",
    rarity: "uncommon",
    element: "fire",
    atk: 4,
    def: 2,
    hp: 9,
    baseValue: 45,
    setId: "ember",
  },
  {
    slug: "cinder-kit",
    name: "Cinder Kit",
    description: "A young flame-hopper learning to spark.",
    rarity: "common",
    element: "fire",
    atk: 3,
    def: 1,
    hp: 6,
    baseValue: 25,
    setId: "ember",
  },
  {
    slug: "scorch-tail",
    name: "Scorch Tail",
    description: "Its tail leaves brief glowing arcs.",
    rarity: "rare",
    element: "fire",
    atk: 7,
    def: 3,
    hp: 10,
    baseValue: 140,
    setId: "ember",
  },
  {
    slug: "volt-cotton",
    name: "Volt Cotton",
    description: "Static fuzz that crackles when excited.",
    rarity: "epic",
    element: "electric",
    atk: 8,
    def: 4,
    hp: 14,
    baseValue: 280,
    setId: "ember",
  },
  {
    slug: "thunder-thump",
    name: "Thunder Thump",
    description: "Each hop rolls like distant thunder.",
    rarity: "epic",
    element: "electric",
    atk: 9,
    def: 5,
    hp: 13,
    baseValue: 300,
    setId: "ember",
  },
  {
    slug: "cinder-monarch",
    name: "Cinder Monarch",
    description: "Crowned in living flame.",
    rarity: "legendary",
    element: "fire",
    atk: 11,
    def: 7,
    hp: 18,
    baseValue: 800,
    setId: "ember",
    abilities: [
      { id: "reign", name: "Ember Reign", description: "Wins ties on fire lanes." },
    ],
  },
  {
    slug: "magma-marshal",
    name: "Magma Marshal",
    description: "Commands the ember trails of the grove.",
    rarity: "legendary",
    element: "fire",
    atk: 12,
    def: 6,
    hp: 17,
    baseValue: 850,
    setId: "ember",
  },

  // Tide Hollow — water & ice
  {
    slug: "tide-tuft",
    name: "Tide Tuft",
    description: "Fur ripples like gentle waves.",
    rarity: "common",
    element: "water",
    atk: 2,
    def: 2,
    hp: 8,
    baseValue: 21,
    setId: "tide",
  },
  {
    slug: "coral-hop",
    name: "Coral Hop",
    description: "Nestles among bright reef gardens.",
    rarity: "uncommon",
    element: "water",
    atk: 4,
    def: 3,
    hp: 10,
    baseValue: 55,
    setId: "tide",
  },
  {
    slug: "glacier-glider",
    name: "Glacier Glider",
    description: "Skims frozen lakes without a sound.",
    rarity: "rare",
    element: "ice",
    atk: 5,
    def: 6,
    hp: 12,
    baseValue: 135,
    setId: "tide",
  },
  {
    slug: "deepcurrent",
    name: "Deepcurrent",
    description: "Pulls rivals into swirling pressure.",
    rarity: "epic",
    element: "water",
    atk: 7,
    def: 7,
    hp: 15,
    baseValue: 290,
    setId: "tide",
  },
  {
    slug: "abyss-oracle",
    name: "Abyss Oracle",
    description: "Sees fortunes in the dark tide.",
    rarity: "legendary",
    element: "water",
    atk: 10,
    def: 9,
    hp: 19,
    baseValue: 820,
    setId: "tide",
  },
  {
    slug: "polar-sovereign",
    name: "Polar Sovereign",
    description: "Rules the quiet ice crowns.",
    rarity: "mythic",
    element: "ice",
    atk: 14,
    def: 11,
    hp: 21,
    baseValue: 2200,
    setId: "tide",
  },

  // Nightveil — shadow & light
  {
    slug: "dusk-dart",
    name: "Dusk Dart",
    description: "A swift silhouette at sunset.",
    rarity: "common",
    element: "shadow",
    atk: 3,
    def: 1,
    hp: 6,
    baseValue: 23,
    setId: "nightveil",
  },
  {
    slug: "halo-hare",
    name: "Halo Hare",
    description: "A gentle ring of light crowns its head.",
    rarity: "uncommon",
    element: "light",
    atk: 3,
    def: 4,
    hp: 9,
    baseValue: 52,
    setId: "nightveil",
  },
  {
    slug: "umbra-stitch",
    name: "Umbra Stitch",
    description: "Sews shadows into soft armor.",
    rarity: "rare",
    element: "shadow",
    atk: 6,
    def: 5,
    hp: 11,
    baseValue: 125,
    setId: "nightveil",
  },
  {
    slug: "prism-patron",
    name: "Prism Patron",
    description: "Bends dawn into seven soft colors.",
    rarity: "epic",
    element: "light",
    atk: 8,
    def: 6,
    hp: 14,
    baseValue: 310,
    setId: "nightveil",
  },
  {
    slug: "eclipse-empress",
    name: "Eclipse Empress",
    description: "Where light and shadow bow together.",
    rarity: "legendary",
    element: "shadow",
    atk: 11,
    def: 8,
    hp: 18,
    baseValue: 900,
    setId: "nightveil",
  },
  {
    slug: "celestine-key",
    name: "Celestine Key",
    description: "Opens doors only legends remember.",
    rarity: "secret",
    element: "light",
    atk: 14,
    def: 13,
    hp: 24,
    baseValue: 5500,
    setId: "nightveil",
  },
];

export const ITEMS = [
  {
    slug: "lucky-charm",
    name: "Lucky Charm",
    description: "+10% rare chance for 10 hunts.",
    category: "hunt_booster" as const,
    effect: {
      type: "hunt_modifier",
      rareBonusBps: 1000,
      huntsRemaining: 10,
    },
    sellPrice: 80,
  },
  {
    slug: "hunters-lens",
    name: "Hunter's Lens",
    description: "+15% special variant chance for 8 hunts.",
    category: "hunt_booster" as const,
    effect: {
      type: "hunt_modifier",
      variantBonusBps: 1500,
      huntsRemaining: 8,
    },
    sellPrice: 100,
  },
  {
    slug: "energy-drink",
    name: "Energy Drink",
    description: "Reduces next hunt cooldown by 30 seconds.",
    category: "consumable" as const,
    effect: {
      type: "hunt_modifier",
      cooldownReduceSeconds: 30,
      huntsRemaining: 1,
    },
    sellPrice: 40,
  },
  {
    slug: "mystery-loot-box",
    name: "Mystery Loot Box",
    description: "Contains random coins, items, or cards.",
    category: "loot_box" as const,
    effect: { type: "loot_box", lootTableSlug: "mystery_box" },
    lootTableSlug: "mystery_box",
    sellPrice: 150,
  },
  {
    slug: "legendary-loot-box",
    name: "Legendary Loot Box",
    description: "High-tier rewards await.",
    category: "loot_box" as const,
    effect: { type: "loot_box", lootTableSlug: "legendary_box" },
    lootTableSlug: "legendary_box",
    sellPrice: 800,
  },
  {
    slug: "pack-ticket",
    name: "Pack Ticket",
    description: "Redeemable toward a standard pack.",
    category: "pack_ticket" as const,
    effect: { type: "none" },
    sellPrice: 200,
  },
];

export const LOOT_TABLES = [
  {
    slug: "hunt_default",
    entries: [
      { weight: 40, reward: { kind: "coins", amount: 35 } },
      { weight: 25, reward: { kind: "coins", amount: 75 } },
      { weight: 18, reward: { kind: "card", rarity: "common" } },
      { weight: 8, reward: { kind: "card", rarity: "uncommon" } },
      { weight: 4, reward: { kind: "card", rarity: "rare" } },
      { weight: 1.5, reward: { kind: "card", rarity: "epic" } },
      { weight: 0.4, reward: { kind: "card", rarity: "legendary" } },
      { weight: 2, reward: { kind: "item", itemSlug: "mystery-loot-box", quantity: 1 } },
      { weight: 1, reward: { kind: "item", itemSlug: "lucky-charm", quantity: 1 } },
    ],
    pity: {
      counterKey: "hunt",
      threshold: 25,
      guaranteeReward: { kind: "card", rarityMin: "rare" },
    },
  },
  {
    slug: "mystery_box",
    entries: [
      { weight: 40, reward: { kind: "coins", amount: 100 } },
      { weight: 20, reward: { kind: "coins", amount: 250 } },
      { weight: 15, reward: { kind: "item", itemSlug: "energy-drink", quantity: 1 } },
      { weight: 15, reward: { kind: "card", rarity: "common" } },
      { weight: 8, reward: { kind: "card", rarity: "uncommon" } },
      { weight: 2, reward: { kind: "card", rarity: "rare" } },
    ],
  },
  {
    slug: "legendary_box",
    entries: [
      { weight: 30, reward: { kind: "coins", amount: 1000 } },
      { weight: 20, reward: { kind: "gems", amount: 5 } },
      { weight: 25, reward: { kind: "card", rarity: "rare" } },
      { weight: 15, reward: { kind: "card", rarity: "epic" } },
      { weight: 8, reward: { kind: "card", rarity: "legendary" } },
      { weight: 2, reward: { kind: "card", rarity: "mythic" } },
    ],
  },
];

export const PACKS = [
  {
    slug: "standard",
    name: "Standard Pack",
    cost: { currency: "coins", amount: 250 },
    cardCount: 5,
    pool: { setIds: ["meadow", "ember", "tide", "nightveil"] },
    rarityWeights: {
      common: 55,
      uncommon: 25,
      rare: 12,
      epic: 6,
      legendary: 1.8,
      mythic: 0.2,
    },
    guarantees: [{ rarity: "uncommon", count: 1 }],
    variantWeights: {
      normal: 90,
      foil: 7,
      golden: 2,
      rainbow: 1,
    },
    enabled: true,
  },
  {
    slug: "fire",
    name: "Fire Pack",
    cost: { currency: "coins", amount: 300 },
    cardCount: 4,
    pool: { setIds: ["ember"], elements: ["fire"] },
    rarityWeights: {
      common: 40,
      uncommon: 30,
      rare: 18,
      epic: 9,
      legendary: 3,
    },
    guarantees: [{ rarity: "rare", count: 1 }],
    variantWeights: { normal: 85, foil: 10, golden: 5 },
    enabled: true,
  },
  {
    slug: "legendary",
    name: "Legendary Pack",
    cost: { currency: "gems", amount: 10 },
    cardCount: 3,
    pool: { setIds: ["meadow", "ember", "tide", "nightveil"] },
    rarityWeights: {
      rare: 40,
      epic: 35,
      legendary: 20,
      mythic: 5,
    },
    guarantees: [{ rarity: "epic", count: 1 }],
    variantWeights: { normal: 70, foil: 15, golden: 10, celestial: 5 },
    enabled: true,
  },
  {
    slug: "tide",
    name: "Tide Pack",
    cost: { currency: "coins", amount: 300 },
    cardCount: 4,
    pool: { setIds: ["tide"] },
    rarityWeights: {
      common: 40,
      uncommon: 30,
      rare: 18,
      epic: 9,
      legendary: 2.5,
      mythic: 0.5,
    },
    guarantees: [{ rarity: "rare", count: 1 }],
    variantWeights: { normal: 85, foil: 10, crystal: 5 },
    enabled: true,
  },
  {
    slug: "nightveil",
    name: "Nightveil Pack",
    cost: { currency: "coins", amount: 320 },
    cardCount: 4,
    pool: { setIds: ["nightveil"] },
    rarityWeights: {
      common: 38,
      uncommon: 28,
      rare: 20,
      epic: 10,
      legendary: 3.5,
      secret: 0.5,
    },
    guarantees: [{ rarity: "rare", count: 1 }],
    variantWeights: { normal: 80, foil: 12, shadow: 5, celestial: 3 },
    enabled: true,
  },
];

export const SHOP = [
  {
    sku: "pack-standard",
    shopId: "main",
    category: "packs",
    itemRef: { kind: "pack", refSlug: "standard" },
    price: { currency: "coins", amount: 250 },
    featured: true,
    enabled: true,
  },
  {
    sku: "pack-fire",
    shopId: "main",
    category: "packs",
    itemRef: { kind: "pack", refSlug: "fire" },
    price: { currency: "coins", amount: 300 },
    enabled: true,
  },
  {
    sku: "pack-tide",
    shopId: "main",
    category: "packs",
    itemRef: { kind: "pack", refSlug: "tide" },
    price: { currency: "coins", amount: 300 },
    enabled: true,
  },
  {
    sku: "pack-nightveil",
    shopId: "main",
    category: "packs",
    itemRef: { kind: "pack", refSlug: "nightveil" },
    price: { currency: "coins", amount: 320 },
    enabled: true,
  },
  {
    sku: "pack-legendary",
    shopId: "main",
    category: "packs",
    itemRef: { kind: "pack", refSlug: "legendary" },
    price: { currency: "gems", amount: 10 },
    featured: true,
    enabled: true,
  },
  {
    sku: "item-lucky-charm",
    shopId: "main",
    category: "items",
    itemRef: { kind: "item", refSlug: "lucky-charm" },
    price: { currency: "coins", amount: 200 },
    enabled: true,
  },
  {
    sku: "item-hunters-lens",
    shopId: "main",
    category: "items",
    itemRef: { kind: "item", refSlug: "hunters-lens" },
    price: { currency: "coins", amount: 250 },
    enabled: true,
  },
  {
    sku: "item-energy-drink",
    shopId: "main",
    category: "items",
    itemRef: { kind: "item", refSlug: "energy-drink" },
    price: { currency: "coins", amount: 100 },
    enabled: true,
  },
  {
    sku: "box-mystery",
    shopId: "main",
    category: "loot_boxes",
    itemRef: { kind: "box", refSlug: "mystery-loot-box" },
    price: { currency: "coins", amount: 400 },
    enabled: true,
  },
  {
    sku: "box-legendary",
    shopId: "main",
    category: "loot_boxes",
    itemRef: { kind: "box", refSlug: "legendary-loot-box" },
    price: { currency: "coins", amount: 2500 },
    enabled: true,
  },
  {
    sku: "ticket-pack",
    shopId: "main",
    category: "tickets",
    itemRef: { kind: "ticket", amount: 1 },
    price: { currency: "coins", amount: 500 },
    enabled: true,
  },
];

export const QUESTS = [
  {
    slug: "daily-hunt-5",
    name: "Morning Hop",
    description: "Hunt 5 times.",
    period: "daily",
    criteria: { type: "hunt", target: 5 },
    rewards: { coins: 150, xp: 50 },
  },
  {
    slug: "daily-win-1",
    name: "First Clash",
    description: "Win 1 battle.",
    period: "daily",
    criteria: { type: "battle_win", target: 1 },
    rewards: { coins: 200, xp: 60 },
  },
  {
    slug: "daily-pack-2",
    name: "Pack Day",
    description: "Open 2 packs.",
    period: "daily",
    criteria: { type: "pack_open", target: 2 },
    rewards: { coins: 100, tickets: 1 },
  },
  {
    slug: "daily-gamble-1",
    name: "Lucky Flip",
    description: "Win 1 gamble.",
    period: "daily",
    criteria: { type: "gamble_win", target: 1 },
    rewards: { coins: 75, xp: 25 },
  },
  {
    slug: "daily-shop-1",
    name: "Window Shopper",
    description: "Buy something from the shop.",
    period: "daily",
    criteria: { type: "shop_buy", target: 1 },
    rewards: { coins: 50, xp: 20 },
  },
];

export const ACHIEVEMENTS = [
  {
    slug: "first-catch",
    name: "First Catch",
    description: "Obtain your first card from a hunt.",
    criteria: { type: "hunt_card", target: 1 },
    rewards: { coins: 100, badge: "first_catch", title: "Hopper" },
    score: 10,
  },
  {
    slug: "collect-50",
    name: "Collector Nest",
    description: "Own 50 card instances.",
    criteria: { type: "cards_owned", target: 50 },
    rewards: { coins: 500, badge: "collector_50" },
    score: 25,
  },
  {
    slug: "obtain-legendary",
    name: "Legend Sighted",
    description: "Obtain a Legendary card.",
    criteria: { type: "rarity_owned", target: 1 },
    rewards: { gems: 5, title: "Legend Seeker" },
    score: 40,
  },
  {
    slug: "win-100",
    name: "Battle Veteran",
    description: "Win 100 battles.",
    criteria: { type: "wins", target: 100 },
    rewards: { coins: 2000, badge: "veteran" },
    score: 50,
  },
  {
    slug: "earn-1m",
    name: "Coin Magnate",
    description: "Earn 1,000,000 coins lifetime (approx via balance milestones).",
    criteria: { type: "coins_balance", target: 1_000_000 },
    rewards: { gems: 20, title: "Magnate" },
    score: 60,
  },
];

async function main() {
  const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/bunnydex";
  await connectDatabase(uri);
  console.log("Seeding BunnyDex...");

  await GameConfig.findOneAndUpdate(
    { key: "default" },
    { key: "default", values: { ...DEFAULT_GAME_CONFIG } },
    { upsert: true },
  );

  for (const v of VARIANTS_SEED) {
    await CardVariant.findOneAndUpdate({ code: v.code }, v, { upsert: true });
  }

  const cardIds: Record<string, string> = {};
  for (const card of CARDS) {
    const doc = await CardDefinition.findOneAndUpdate(
      { slug: card.slug },
      {
        ...card,
        cardType: "bunny",
        imageUrl: `/cards/${card.slug}.png`,
        release: { releasedAt: new Date(), isLimited: card.rarity === "secret" },
        flags: {
          isStarter: card.flags?.isStarter ?? false,
          isTradable: true,
          isCraftable: false,
        },
        abilities: card.abilities ?? [],
      },
      { upsert: true, new: true },
    );
    cardIds[card.slug] = String(doc._id);
  }

  for (const item of ITEMS) {
    await ItemDefinition.findOneAndUpdate({ slug: item.slug }, item, { upsert: true });
  }

  for (const table of LOOT_TABLES) {
    await LootTable.findOneAndUpdate({ slug: table.slug }, table, { upsert: true });
  }

  for (const pack of PACKS) {
    await Pack.findOneAndUpdate({ slug: pack.slug }, pack, { upsert: true });
  }

  for (const offer of SHOP) {
    await ShopOffer.findOneAndUpdate({ sku: offer.sku }, offer, { upsert: true });
  }

  for (const q of QUESTS) {
    await Quest.findOneAndUpdate({ slug: q.slug }, q, { upsert: true });
  }

  for (const a of ACHIEVEMENTS) {
    await Achievement.findOneAndUpdate({ slug: a.slug }, a, { upsert: true });
  }

  const bySet = (setId: string) =>
    CARDS.filter((c) => c.setId === setId).map((c) => cardIds[c.slug]!);

  await CollectionSet.findOneAndUpdate(
    { setId: "meadow" },
    {
      setId: "meadow",
      name: "Meadow Beginnings",
      description: "The first flock of BunnyDex explorers.",
      cardDefinitionIds: bySet("meadow"),
    },
    { upsert: true },
  );

  await CollectionSet.findOneAndUpdate(
    { setId: "ember" },
    {
      setId: "ember",
      name: "Ember Grove",
      description: "Fire-touched bunnies of the Ember Grove.",
      cardDefinitionIds: bySet("ember"),
    },
    { upsert: true },
  );

  await CollectionSet.findOneAndUpdate(
    { setId: "tide" },
    {
      setId: "tide",
      name: "Tide Hollow",
      description: "Water and ice hoppers of the deep tide.",
      cardDefinitionIds: bySet("tide"),
    },
    { upsert: true },
  );

  await CollectionSet.findOneAndUpdate(
    { setId: "nightveil" },
    {
      setId: "nightveil",
      name: "Nightveil",
      description: "Shadow and light legends of the veil.",
      cardDefinitionIds: bySet("nightveil"),
    },
    { upsert: true },
  );

  console.log(`Seeded ${CARDS.length} cards and supporting game data.`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
