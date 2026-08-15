import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { UserStats, ProfileCustomization } from "@bunnydex/types";

const userStatsSchema = new Schema<UserStats>(
  {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    hunts: { type: Number, default: 0 },
    packsOpened: { type: Number, default: 0 },
    tradesCompleted: { type: Number, default: 0 },
    marketplaceSales: { type: Number, default: 0 },
    cardsOwned: { type: Number, default: 0 },
    collectionUnique: { type: Number, default: 0 },
    achievementScore: { type: Number, default: 0 },
    gamblesWon: { type: Number, default: 0 },
    shopPurchases: { type: Number, default: 0 },
  },
  { _id: false },
);

const profileSchema = new Schema<ProfileCustomization>(
  {
    bio: String,
    accent: String,
    frame: String,
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarUrl: String,
    coins: { type: Number, default: 0, min: 0 },
    gems: { type: Number, default: 0, min: 0 },
    tickets: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    battleRating: { type: Number, default: 1000, index: true },
    stats: { type: userStatsSchema, default: () => ({}) },
    favoriteUserCardId: { type: Schema.Types.ObjectId, ref: "UserCard" },
    titles: { type: [String], default: [] },
    badges: { type: [String], default: [] },
    activeTitle: String,
    profile: { type: profileSchema, default: () => ({}) },
    flags: {
      banned: { type: Boolean, default: false },
      isAdmin: { type: Boolean, default: false },
    },
    cooldowns: {
      lastHuntAt: Date,
      lastWorkAt: Date,
      lastDailyAt: Date,
      lastGambleAt: Date,
    },
    pity: {
      hunt: { type: Number, default: 0 },
    },
    gambleDaily: {
      dateKey: String,
      wagered: { type: Number, default: 0 },
    },
    startedAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ coins: -1 });
userSchema.index({ level: -1 });
userSchema.index({ "stats.collectionUnique": -1 });
userSchema.index({ "stats.wins": -1 });
userSchema.index({ "stats.achievementScore": -1 });

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: Schema.Types.ObjectId;
};

export const User: Model<UserDocument> =
  (globalThis as { UserModel?: Model<UserDocument> }).UserModel ??
  model<UserDocument>("User", userSchema);

(globalThis as { UserModel?: Model<UserDocument> }).UserModel = User;
