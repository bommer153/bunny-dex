import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { ACQUISITION_SOURCES, USER_CARD_STATUSES, VARIANTS } from "@bunnydex/types";

const userCardSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cardDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "CardDefinition",
      required: true,
      index: true,
    },
    variant: { type: String, enum: VARIANTS, default: "normal" },
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0 },
    acquiredFrom: { type: String, enum: ACQUISITION_SOURCES, required: true },
    acquiredAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: USER_CARD_STATUSES,
      default: "available",
      index: true,
    },
    listingId: { type: Schema.Types.ObjectId, ref: "MarketplaceListing" },
    tradeId: { type: Schema.Types.ObjectId, ref: "Trade" },
    lockedReason: String,
  },
  { timestamps: true },
);

userCardSchema.index({ userId: 1, status: 1 });
userCardSchema.index({ userId: 1, cardDefinitionId: 1, variant: 1 });
userCardSchema.index({ listingId: 1 });

export type UserCardDocument = InferSchemaType<typeof userCardSchema> & {
  _id: Schema.Types.ObjectId;
};

export const UserCard = model<UserCardDocument>("UserCard", userCardSchema);
