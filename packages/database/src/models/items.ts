import { Schema, model, type InferSchemaType } from "mongoose";
import { CURRENCIES, ITEM_CATEGORIES } from "@bunnydex/types";

const itemDefinitionSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: ITEM_CATEGORIES, required: true },
    stackable: { type: Boolean, default: true },
    maxStack: Number,
    effect: { type: Schema.Types.Mixed, default: { type: "none" } },
    lootTableSlug: String,
    imageUrl: { type: String, default: "" },
    tradable: { type: Boolean, default: true },
    sellPrice: Number,
  },
  { timestamps: true },
);

export type ItemDefinitionDocument = InferSchemaType<typeof itemDefinitionSchema> & {
  _id: Schema.Types.ObjectId;
};

export const ItemDefinition = model<ItemDefinitionDocument>(
  "ItemDefinition",
  itemDefinitionSchema,
);

const activeEffectSchema = new Schema(
  {
    type: String,
    rareBonusBps: Number,
    variantBonusBps: Number,
    cooldownReduceSeconds: Number,
    huntsRemaining: Number,
    expiresAt: Date,
  },
  { _id: false },
);

const inventoryStackSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    itemDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "ItemDefinition",
      required: true,
    },
    quantity: { type: Number, default: 0, min: 0 },
    expiresAt: Date,
    metadata: Schema.Types.Mixed,
    activeEffects: { type: [activeEffectSchema], default: [] },
  },
  { timestamps: true },
);

inventoryStackSchema.index({ userId: 1, itemDefinitionId: 1 }, { unique: true });

export type InventoryStackDocument = InferSchemaType<typeof inventoryStackSchema> & {
  _id: Schema.Types.ObjectId;
};

export const InventoryStack = model<InventoryStackDocument>(
  "InventoryStack",
  inventoryStackSchema,
);

const lootEntrySchema = new Schema(
  {
    weight: { type: Number, required: true, min: 0 },
    reward: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const lootTableSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    entries: { type: [lootEntrySchema], default: [] },
    pity: {
      counterKey: String,
      threshold: Number,
      guaranteeReward: Schema.Types.Mixed,
    },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export type LootTableDocument = InferSchemaType<typeof lootTableSchema> & {
  _id: Schema.Types.ObjectId;
};

export const LootTable = model<LootTableDocument>("LootTable", lootTableSchema);

const packSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    cost: {
      currency: { type: String, enum: CURRENCIES, default: "coins" },
      amount: { type: Number, required: true },
    },
    cardCount: { type: Number, default: 5 },
    pool: {
      setIds: { type: [String], default: [] },
      elements: { type: [String], default: [] },
    },
    rarityWeights: { type: Map, of: Number, default: {} },
    guarantees: [
      {
        rarity: String,
        count: Number,
      },
    ],
    variantWeights: { type: Map, of: Number, default: {} },
    availableFrom: Date,
    availableTo: Date,
    purchaseLimit: Number,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type PackDocument = InferSchemaType<typeof packSchema> & {
  _id: Schema.Types.ObjectId;
};

export const Pack = model<PackDocument>("Pack", packSchema);
