import { Schema, model, type InferSchemaType } from "mongoose";
import { BATTLE_MODES, BATTLE_STATUSES } from "@bunnydex/types";

const deckSlotSchema = new Schema(
  {
    userCardId: { type: Schema.Types.ObjectId, ref: "UserCard", required: true },
    cardDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "CardDefinition",
      required: true,
    },
  },
  { _id: false },
);

const deckSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    slots: { type: [deckSlotSchema], default: [] },
    validation: {
      isValid: { type: Boolean, default: false },
      errors: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

deckSchema.index({ userId: 1, name: 1 }, { unique: true });
deckSchema.index({ userId: 1, isActive: 1 });

export type DeckDocument = InferSchemaType<typeof deckSchema> & {
  _id: Schema.Types.ObjectId;
};

export const Deck = model<DeckDocument>("Deck", deckSchema);

const cardSnapshotSchema = new Schema(
  {
    userCardId: Schema.Types.ObjectId,
    cardDefinitionId: Schema.Types.ObjectId,
    name: String,
    rarity: String,
    element: String,
    atk: Number,
    def: Number,
    hp: Number,
    variant: String,
    level: Number,
  },
  { _id: false },
);

const laneResultSchema = new Schema(
  {
    lane: Number,
    challengerCard: cardSnapshotSchema,
    opponentCard: cardSnapshotSchema,
    challengerScore: Number,
    opponentScore: Number,
    winner: { type: String, enum: ["challenger", "opponent", "draw"] },
  },
  { _id: false },
);

const battleSchema = new Schema(
  {
    challengerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    opponentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: BATTLE_MODES, required: true },
    status: { type: String, enum: BATTLE_STATUSES, default: "pending", index: true },
    seed: { type: String, required: true },
    lanes: { type: [laneResultSchema], default: [] },
    winnerId: { type: Schema.Types.ObjectId, ref: "User" },
    rewards: Schema.Types.Mixed,
    ratingDelta: {
      challenger: Number,
      opponent: Number,
    },
    guildId: String,
    channelId: String,
  },
  { timestamps: true },
);

battleSchema.index({ challengerId: 1, createdAt: -1 });
battleSchema.index({ opponentId: 1, createdAt: -1 });

export type BattleDocument = InferSchemaType<typeof battleSchema> & {
  _id: Schema.Types.ObjectId;
};

export const Battle = model<BattleDocument>("Battle", battleSchema);

const matchmakingQueueSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    rating: { type: Number, required: true },
    guildId: String,
    channelId: String,
    enqueuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

matchmakingQueueSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type MatchmakingQueueDocument = InferSchemaType<
  typeof matchmakingQueueSchema
> & { _id: Schema.Types.ObjectId };

export const MatchmakingQueue = model<MatchmakingQueueDocument>(
  "MatchmakingQueue",
  matchmakingQueueSchema,
);
