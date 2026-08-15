import { z } from "zod";
import {
  ACQUISITION_SOURCES,
  CURRENCIES,
  ELEMENTS,
  ITEM_CATEGORIES,
  RARITIES,
  VARIANTS,
} from "@bunnydex/types";

export const discordIdentitySchema = z.object({
  discordId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().optional(),
});

export const currencySchema = z.enum(CURRENCIES);
export const raritySchema = z.enum(RARITIES);
export const elementSchema = z.enum(ELEMENTS);
export const variantSchema = z.enum(VARIANTS);
export const itemCategorySchema = z.enum(ITEM_CATEGORIES);
export const acquisitionSourceSchema = z.enum(ACQUISITION_SOURCES);

export const huntModifierEffectSchema = z.object({
  type: z.literal("hunt_modifier"),
  rareBonusBps: z.number().int().default(0),
  variantBonusBps: z.number().int().default(0),
  cooldownReduceSeconds: z.number().int().default(0),
  huntsRemaining: z.number().int().positive().optional(),
});

export const itemEffectSchema = z.discriminatedUnion("type", [
  huntModifierEffectSchema,
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("loot_box"),
    lootTableSlug: z.string(),
  }),
]);

export const lootRewardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("coins"), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("gems"), amount: z.number().int().positive() }),
  z.object({ kind: z.literal("tickets"), amount: z.number().int().positive() }),
  z.object({
    kind: z.literal("item"),
    itemSlug: z.string(),
    quantity: z.number().int().positive().default(1),
  }),
  z.object({
    kind: z.literal("card"),
    rarityMin: raritySchema.optional(),
    rarity: raritySchema.optional(),
    setId: z.string().optional(),
    element: elementSchema.optional(),
    variantWeights: z.record(z.number()).optional(),
  }),
  z.object({ kind: z.literal("pack"), packSlug: z.string() }),
  z.object({ kind: z.literal("box"), itemSlug: z.string() }),
]);

export const gambleFlipSchema = z.object({
  amount: z.number().int().positive(),
  side: z.enum(["heads", "tails"]),
});

export const marketSellSchema = z.object({
  userCardId: z.string().min(1),
  priceCoins: z.number().int().positive(),
});

export const shopBuySchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export const deckNameSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-zA-Z0-9 _-]+$/);

export const gameConfigPatchSchema = z
  .object({
    huntCooldownSeconds: z.number().int().positive().optional(),
    marketplaceFeeBps: z.number().int().min(0).max(5000).optional(),
    gambleMinBet: z.number().int().positive().optional(),
    gambleMaxBet: z.number().int().positive().optional(),
    gambleDailyWagerCap: z.number().int().positive().optional(),
    deckSize: z.number().int().positive().optional(),
    maxCopiesPerDefinition: z.number().int().positive().optional(),
  })
  .passthrough();
