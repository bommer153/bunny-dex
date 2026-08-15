import { Schema, model, type InferSchemaType } from "mongoose";

const questSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    period: { type: String, enum: ["daily", "weekly", "once"], default: "daily" },
    criteria: {
      type: {
        type: String,
        required: true,
      },
      target: { type: Number, required: true },
    },
    rewards: {
      coins: Number,
      gems: Number,
      tickets: Number,
      xp: Number,
      itemSlug: String,
      itemQty: Number,
    },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type QuestDocument = InferSchemaType<typeof questSchema> & {
  _id: Schema.Types.ObjectId;
};

export const Quest = model<QuestDocument>("Quest", questSchema);

const userQuestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    questId: { type: Schema.Types.ObjectId, ref: "Quest", required: true },
    periodKey: { type: String, required: true },
    progress: { type: Number, default: 0 },
    completedAt: Date,
    claimedAt: Date,
  },
  { timestamps: true },
);

userQuestSchema.index({ userId: 1, questId: 1, periodKey: 1 }, { unique: true });

export type UserQuestDocument = InferSchemaType<typeof userQuestSchema> & {
  _id: Schema.Types.ObjectId;
};

export const UserQuest = model<UserQuestDocument>("UserQuest", userQuestSchema);

const achievementSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    criteria: {
      type: { type: String, required: true },
      target: { type: Number, required: true },
    },
    rewards: {
      coins: Number,
      gems: Number,
      xp: Number,
      title: String,
      badge: String,
      itemSlug: String,
    },
    score: { type: Number, default: 10 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type AchievementDocument = InferSchemaType<typeof achievementSchema> & {
  _id: Schema.Types.ObjectId;
};

export const Achievement = model<AchievementDocument>("Achievement", achievementSchema);

const userAchievementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    achievementId: {
      type: Schema.Types.ObjectId,
      ref: "Achievement",
      required: true,
    },
    unlockedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export type UserAchievementDocument = InferSchemaType<typeof userAchievementSchema> & {
  _id: Schema.Types.ObjectId;
};

export const UserAchievement = model<UserAchievementDocument>(
  "UserAchievement",
  userAchievementSchema,
);

const collectionSchema = new Schema(
  {
    setId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    cardDefinitionIds: [{ type: Schema.Types.ObjectId, ref: "CardDefinition" }],
  },
  { timestamps: true },
);

export type CollectionDocument = InferSchemaType<typeof collectionSchema> & {
  _id: Schema.Types.ObjectId;
};

export const CollectionSet = model<CollectionDocument>("CollectionSet", collectionSchema);

const userCollectionProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    setId: { type: String, required: true },
    ownedUnique: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    completedAt: Date,
  },
  { timestamps: true },
);

userCollectionProgressSchema.index({ userId: 1, setId: 1 }, { unique: true });

export type UserCollectionProgressDocument = InferSchemaType<
  typeof userCollectionProgressSchema
> & { _id: Schema.Types.ObjectId };

export const UserCollectionProgress = model<UserCollectionProgressDocument>(
  "UserCollectionProgress",
  userCollectionProgressSchema,
);
