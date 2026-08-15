export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "secret",
] as const;
export type Rarity = (typeof RARITIES)[number];

export const ELEMENTS = [
  "fire",
  "water",
  "nature",
  "electric",
  "ice",
  "shadow",
  "light",
] as const;
export type Element = (typeof ELEMENTS)[number];

export const CARD_TYPES = ["bunny", "spell", "artifact"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const VARIANTS = [
  "normal",
  "foil",
  "golden",
  "shadow",
  "crystal",
  "rainbow",
  "celestial",
  "royal",
] as const;
export type Variant = (typeof VARIANTS)[number];

export const CURRENCIES = ["coins", "gems", "tickets"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const USER_CARD_STATUSES = [
  "available",
  "listed",
  "in_trade",
  "locked",
] as const;
export type UserCardStatus = (typeof USER_CARD_STATUSES)[number];

export const ACQUISITION_SOURCES = [
  "hunt",
  "pack",
  "trade",
  "market",
  "admin",
  "quest",
  "achievement",
  "event",
  "starter",
  "loot_box",
] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const ITEM_CATEGORIES = [
  "hunt_booster",
  "consumable",
  "loot_box",
  "pack_ticket",
  "event",
  "crafting",
  "cosmetic",
  "special",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const BATTLE_MODES = ["random", "direct"] as const;
export type BattleMode = (typeof BATTLE_MODES)[number];

export const BATTLE_STATUSES = [
  "queued",
  "pending",
  "active",
  "completed",
  "cancelled",
  "expired",
] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

export const TRADE_STATUSES = [
  "proposed",
  "open",
  "locked",
  "completed",
  "cancelled",
  "expired",
] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const LISTING_STATUSES = [
  "active",
  "sold",
  "cancelled",
  "expired",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type DomainErrorCode =
  | "NOT_FOUND"
  | "COOLDOWN"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_STATE"
  | "VALIDATION"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMIT";

export interface DomainErrorShape {
  code: DomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiscordIdentity {
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface UserStats {
  wins: number;
  losses: number;
  hunts: number;
  packsOpened: number;
  tradesCompleted: number;
  marketplaceSales: number;
  cardsOwned: number;
  collectionUnique: number;
  achievementScore: number;
  gamblesWon: number;
  shopPurchases: number;
}

export interface ProfileCustomization {
  bio?: string;
  accent?: string;
  frame?: string;
}

export interface CardAbility {
  id: string;
  name: string;
  description: string;
  params?: Record<string, number | string | boolean>;
}

export interface CurrencyAmount {
  currency: Currency;
  amount: number;
}

export type LeaderboardKind =
  | "wealth"
  | "collection"
  | "rating"
  | "wins"
  | "achievements"
  | "rare"
  | "value";
