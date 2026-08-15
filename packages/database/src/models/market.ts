import { Schema, model, type InferSchemaType } from "mongoose";
import { LISTING_STATUSES, TRADE_STATUSES, VARIANTS } from "@bunnydex/types";

const tradeOfferSchema = new Schema(
  {
    userCardIds: [{ type: Schema.Types.ObjectId, ref: "UserCard" }],
    items: [
      {
        itemDefinitionId: { type: Schema.Types.ObjectId, ref: "ItemDefinition" },
        quantity: Number,
      },
    ],
    coins: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const tradeSchema = new Schema(
  {
    initiatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    partnerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: TRADE_STATUSES, default: "proposed", index: true },
    initiatorOffer: { type: tradeOfferSchema, default: () => ({}) },
    partnerOffer: { type: tradeOfferSchema, default: () => ({}) },
    confirmations: {
      initiator: { type: Boolean, default: false },
      partner: { type: Boolean, default: false },
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

tradeSchema.index({ initiatorId: 1, status: 1 });
tradeSchema.index({ partnerId: 1, status: 1 });

export type TradeDocument = InferSchemaType<typeof tradeSchema> & {
  _id: Schema.Types.ObjectId;
};

export const Trade = model<TradeDocument>("Trade", tradeSchema);

const marketplaceListingSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assetType: { type: String, enum: ["card", "item"], required: true },
    userCardId: { type: Schema.Types.ObjectId, ref: "UserCard" },
    cardDefinitionId: { type: Schema.Types.ObjectId, ref: "CardDefinition", index: true },
    itemDefinitionId: { type: Schema.Types.ObjectId, ref: "ItemDefinition" },
    quantity: Number,
    priceCoins: { type: Number, required: true, min: 1 },
    status: { type: String, enum: LISTING_STATUSES, default: "active", index: true },
    expiresAt: { type: Date, required: true },
    feeBpsSnapshot: { type: Number, required: true },
    // denormalized search fields
    name: String,
    rarity: String,
    element: String,
    variant: { type: String, enum: VARIANTS },
  },
  { timestamps: true },
);

marketplaceListingSchema.index({ status: 1, priceCoins: 1 });
marketplaceListingSchema.index({ status: 1, rarity: 1, element: 1 });
marketplaceListingSchema.index({ name: "text" });

export type MarketplaceListingDocument = InferSchemaType<
  typeof marketplaceListingSchema
> & { _id: Schema.Types.ObjectId };

export const MarketplaceListing = model<MarketplaceListingDocument>(
  "MarketplaceListing",
  marketplaceListingSchema,
);

const marketplaceTransactionSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: "MarketplaceListing", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    priceCoins: { type: Number, required: true },
    feeCoins: { type: Number, required: true },
    sellerNet: { type: Number, required: true },
    assetType: String,
    userCardId: Schema.Types.ObjectId,
    cardDefinitionId: Schema.Types.ObjectId,
    itemDefinitionId: Schema.Types.ObjectId,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type MarketplaceTransactionDocument = InferSchemaType<
  typeof marketplaceTransactionSchema
> & { _id: Schema.Types.ObjectId };

export const MarketplaceTransaction = model<MarketplaceTransactionDocument>(
  "MarketplaceTransaction",
  marketplaceTransactionSchema,
);

const cardMarketStatsSchema = new Schema(
  {
    cardDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "CardDefinition",
      required: true,
    },
    variant: { type: String, enum: VARIANTS, default: "normal" },
    supply: { type: Number, default: 0 },
    owners: { type: Number, default: 0 },
    lowestListing: Number,
    avgSale: Number,
    highSale: Number,
    lastSaleAt: Date,
    recentSales: { type: [Number], default: [] },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

cardMarketStatsSchema.index({ cardDefinitionId: 1, variant: 1 }, { unique: true });

export type CardMarketStatsDocument = InferSchemaType<typeof cardMarketStatsSchema> & {
  _id: Schema.Types.ObjectId;
};

export const CardMarketStats = model<CardMarketStatsDocument>(
  "CardMarketStats",
  cardMarketStatsSchema,
);
