export const DEFAULT_GAME_CONFIG = {
  huntCooldownSeconds: 60,
  workCooldownSeconds: 300,
  dailyCooldownSeconds: 86_400,
  gambleCooldownSeconds: 5,
  marketplaceFeeBps: 500,
  deckSize: 12,
  maxCopiesPerDefinition: 3,
  battleLaneCount: 3,
  starterCoins: 500,
  dailyRewardCoins: 250,
  workRewardMin: 50,
  workRewardMax: 150,
  huntXp: 15,
  battleWinCoins: 100,
  battleLossCoins: 25,
  battleWinXp: 40,
  battleLossXp: 10,
  startingBattleRating: 1000,
  matchmakingRatingBand: 200,
  matchmakingQueueTtlSeconds: 120,
  gambleMinBet: 10,
  gambleMaxBet: 10_000,
  gambleDailyWagerCap: 50_000,
  npcSellRateBps: 4000,
  listingDefaultTtlHours: 72,
  tradeTtlMinutes: 30,
  pityHuntThreshold: 25,
  xpPerLevelBase: 100,
  xpPerLevelGrowth: 1.15,
  huntLootTableSlug: "hunt_default",
  mysteryBoxLootTableSlug: "mystery_box",
  legendaryBoxLootTableSlug: "legendary_box",
} as const;

export type GameBalanceConfig = {
  -readonly [K in keyof typeof DEFAULT_GAME_CONFIG]: (typeof DEFAULT_GAME_CONFIG)[K];
};

/** Element advantage: attacker beats defender → +25% ATK for lane score */
export const ELEMENT_ADVANTAGE: Record<string, string> = {
  fire: "nature",
  nature: "water",
  water: "fire",
  electric: "ice",
  ice: "shadow",
  shadow: "light",
  light: "electric",
};

export const COMMAND_PREFIX = "bd";
