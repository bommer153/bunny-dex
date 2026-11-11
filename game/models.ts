import { Schema, deleteModel, model, models, type InferSchemaType, type Model } from "mongoose";

// Players are keyed by Discord ID everywhere, so the bot and the web never need a lookup step.

const userSchema = new Schema(
  {
    discordId: { type: String, required: true, unique: true },
    username: { type: String, default: "" },
    coins: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1, index: true },
    items: { type: Map, of: Number, default: {} },
    deck: { type: [String], default: [] }, // UserCard codes, max CONFIG.teamSize
    lastDaily: Date,
    // No default on purpose: missing = "full", so existing players start full and the spend guard can match a missing field.
    energy: Number,
    energyAt: Date, // when `energy` was last stored; regen counts from here
    huntsSinceRare: { type: Number, default: 0 },
    cloverHunts: { type: Number, default: 0 },
    extraBurrowSlots: { type: Number, default: 0 },
    shopDay: String, // "YYYY-MM-DD" that shopBuys counts belong to
    shopBuys: { type: Map, of: Number, default: {} },
    stats: {
      hunts: { type: Number, default: 0 },
      battlesWon: { type: Number, default: 0 },
      battlesLost: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export const CARD_STATUSES = ["available", "burrow", "trade", "listed", "auction"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

const userCardSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // short id players type, e.g. "k3x9qa"
    ownerId: { type: String, required: true, index: true },
    slug: { type: String, required: true, index: true },
    variant: { type: String, default: "normal" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    status: { type: String, enum: CARD_STATUSES, default: "available" },
    burrowSince: Date,
  },
  { timestamps: true },
);
userCardSchema.index({ ownerId: 1, status: 1 });

const offerSchema = new Schema(
  { cards: { type: [String], default: [] }, coins: { type: Number, default: 0, min: 0 }, confirmed: { type: Boolean, default: false } },
  { _id: false },
);

const tradeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    fromId: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    from: { type: offerSchema, default: () => ({}) },
    to: { type: offerSchema, default: () => ({}) },
    // pending = waiting for partner to accept; settling = guard against double settlement
    status: { type: String, enum: ["pending", "open", "settling", "done", "cancelled"], default: "pending", index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const listingSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    sellerId: { type: String, required: true, index: true },
    cardCode: { type: String, required: true },
    slug: { type: String, required: true },
    variant: { type: String, default: "normal" },
    level: { type: Number, default: 1 },
    price: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["active", "pending", "sold", "cancelled", "expired"], default: "active", index: true },
    buyerId: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const auctionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    sellerId: { type: String, required: true, index: true },
    cardCode: { type: String, required: true },
    slug: { type: String, required: true },
    variant: { type: String, default: "normal" },
    level: { type: Number, default: 1 },
    minBid: { type: Number, required: true, min: 1 },
    buyout: Number,
    topBid: { type: Number, default: 0 },
    topBidderId: String,
    bids: { type: Number, default: 0 },
    endsAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "settled", "cancelled"], default: "active", index: true },
    channelId: String, // where to announce the result
  },
  { timestamps: true },
);

function getModel<S extends Schema>(name: string, schema: S) {
  // Next dev hot-reloads this file but keeps mongoose alive. Reusing the cached model would keep the OLD schema,
  // and strict mode then silently drops any new field from writes (this is how `energy` stopped saving).
  // Recompiling from the current schema each time the module loads avoids that.
  if (models[name]) deleteModel(name);
  return model(name, schema) as Model<InferSchemaType<S>>;
}

export const User = getModel("User", userSchema);
export const UserCard = getModel("UserCard", userCardSchema);
export const Trade = getModel("Trade", tradeSchema);
export const Listing = getModel("Listing", listingSchema);
export const Auction = getModel("Auction", auctionSchema);

export type UserDoc = InferSchemaType<typeof userSchema>;
export type UserCardDoc = InferSchemaType<typeof userCardSchema>;
export type AuctionDoc = InferSchemaType<typeof auctionSchema>;
export type ListingDoc = InferSchemaType<typeof listingSchema>;
export type TradeDoc = InferSchemaType<typeof tradeSchema>;
