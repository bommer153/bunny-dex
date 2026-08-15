import { Schema, model, type InferSchemaType } from "mongoose";

const gameConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    values: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export type GameConfigDocument = InferSchemaType<typeof gameConfigSchema> & {
  _id: Schema.Types.ObjectId;
};

export const GameConfig = model<GameConfigDocument>("GameConfig", gameConfigSchema);

const adminAuditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorDiscordId: String,
    action: { type: String, required: true },
    payload: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminAuditLogSchema.index({ createdAt: -1 });

export type AdminAuditLogDocument = InferSchemaType<typeof adminAuditLogSchema> & {
  _id: Schema.Types.ObjectId;
};

export const AdminAuditLog = model<AdminAuditLogDocument>(
  "AdminAuditLog",
  adminAuditLogSchema,
);

const gameEventSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    modifiers: Schema.Types.Mixed,
    lootTableOverrides: Schema.Types.Mixed,
    window: {
      startsAt: Date,
      endsAt: Date,
    },
    enabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type GameEventDocument = InferSchemaType<typeof gameEventSchema> & {
  _id: Schema.Types.ObjectId;
};

export const GameEvent = model<GameEventDocument>("GameEvent", gameEventSchema);
