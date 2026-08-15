import { Schema, model, type InferSchemaType } from "mongoose";
import { CURRENCIES } from "@bunnydex/types";

const shopOfferSchema = new Schema(
  {
    shopId: { type: String, default: "main", index: true },
    sku: { type: String, required: true, unique: true },
    category: {
      type: String,
      enum: ["packs", "items", "loot_boxes", "tickets", "special", "event"],
      required: true,
    },
    itemRef: {
      kind: {
        type: String,
        enum: ["pack", "item", "box", "ticket", "coins"],
        required: true,
      },
      refSlug: String,
      amount: Number,
    },
    price: {
      currency: { type: String, enum: CURRENCIES, default: "coins" },
      amount: { type: Number, required: true },
    },
    stock: Number,
    perUserLimit: Number,
    rotationKey: String,
    featured: { type: Boolean, default: false },
    discountBps: { type: Number, default: 0 },
    startsAt: Date,
    endsAt: Date,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ShopOfferDocument = InferSchemaType<typeof shopOfferSchema> & {
  _id: Schema.Types.ObjectId;
};

export const ShopOffer = model<ShopOfferDocument>("ShopOffer", shopOfferSchema);

const economyTransactionSchema = new Schema(
  {
    type: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    counterpartyId: { type: Schema.Types.ObjectId, ref: "User" },
    amount: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    balanceAfter: { type: Number, required: true },
    refType: String,
    refId: String,
    idempotencyKey: { type: String, required: true, unique: true },
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

economyTransactionSchema.index({ userId: 1, createdAt: -1 });
economyTransactionSchema.index({ refType: 1, refId: 1 });

export type EconomyTransactionDocument = InferSchemaType<
  typeof economyTransactionSchema
> & { _id: Schema.Types.ObjectId };

export const EconomyTransaction = model<EconomyTransactionDocument>(
  "EconomyTransaction",
  economyTransactionSchema,
);
