import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { ELEMENTS, RARITIES, CARD_TYPES, VARIANTS } from "@bunnydex/types";

const abilitySchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    params: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const cardDefinitionSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    rarity: { type: String, enum: RARITIES, required: true, index: true },
    element: { type: String, enum: ELEMENTS, required: true, index: true },
    cardType: { type: String, enum: CARD_TYPES, default: "bunny" },
    atk: { type: Number, required: true },
    def: { type: Number, required: true },
    hp: { type: Number, required: true },
    abilities: { type: [abilitySchema], default: [] },
    baseValue: { type: Number, required: true },
    imageUrl: { type: String, default: "" },
    setId: { type: String, required: true, index: true },
    release: {
      releasedAt: { type: Date, default: Date.now },
      isLimited: { type: Boolean, default: false },
      eventId: String,
    },
    flags: {
      isStarter: { type: Boolean, default: false },
      isTradable: { type: Boolean, default: true },
      isCraftable: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

cardDefinitionSchema.index({ setId: 1, rarity: 1 });
cardDefinitionSchema.index({ element: 1, rarity: 1 });
cardDefinitionSchema.index({ name: "text" });

export type CardDefinitionDocument = InferSchemaType<typeof cardDefinitionSchema> & {
  _id: Schema.Types.ObjectId;
};

export const CardDefinition =
  model<CardDefinitionDocument>("CardDefinition", cardDefinitionSchema);

const cardVariantSchema = new Schema(
  {
    code: { type: String, enum: VARIANTS, required: true, unique: true },
    displayName: { type: String, required: true },
    valueMultiplier: { type: Number, default: 1 },
    huntWeightMod: { type: Number, default: 1 },
    cosmeticOnly: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type CardVariantDocument = InferSchemaType<typeof cardVariantSchema> & {
  _id: Schema.Types.ObjectId;
};

export const CardVariant = model<CardVariantDocument>("CardVariant", cardVariantSchema);
