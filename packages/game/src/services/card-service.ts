import {
  CardMarketStats,
  User,
  UserCard,
  UserCollectionProgress,
  CollectionSet,
} from "@bunnydex/database";
import type { AcquisitionSource, UserCardStatus, Variant } from "@bunnydex/types";
import { assertFound, DomainError } from "../errors.js";
import { EventBus } from "../event-bus.js";
import type mongoose from "mongoose";

export class CardService {
  static async grantCard(input: {
    userId: string;
    cardDefinitionId: string;
    variant?: Variant;
    acquiredFrom: AcquisitionSource;
    session?: mongoose.ClientSession;
  }) {
    const [card] = await UserCard.create(
      [
        {
          userId: input.userId,
          cardDefinitionId: input.cardDefinitionId,
          variant: input.variant ?? "normal",
          acquiredFrom: input.acquiredFrom,
          acquiredAt: new Date(),
          status: "available",
        },
      ],
      { session: input.session },
    );

    await User.findByIdAndUpdate(
      input.userId,
      { $inc: { "stats.cardsOwned": 1 } },
      { session: input.session },
    );

    await CardMarketStats.findOneAndUpdate(
      {
        cardDefinitionId: input.cardDefinitionId,
        variant: input.variant ?? "normal",
      },
      {
        $inc: { supply: 1 },
        $set: { computedAt: new Date() },
      },
      { upsert: true, session: input.session },
    );

    await this.refreshCollectionStats(input.userId, input.session);
    await EventBus.emit("card.granted", {
      userId: input.userId,
      cardDefinitionId: input.cardDefinitionId,
      userCardId: String(card!._id),
      acquiredFrom: input.acquiredFrom,
    });

    return card!;
  }

  static async getUserCards(userId: string, status?: UserCardStatus) {
    const q: Record<string, unknown> = { userId };
    if (status) q.status = status;
    return UserCard.find(q).populate("cardDefinitionId").sort({ acquiredAt: -1 });
  }

  static async requireOwnedAvailable(userId: string, userCardId: string) {
    const card = await UserCard.findOne({
      _id: userCardId,
      userId,
      status: "available",
    });
    return assertFound(card, "Card not available in your inventory.");
  }

  static async setStatus(
    userCardId: string,
    status: UserCardStatus,
    extra: Record<string, unknown> = {},
    session?: mongoose.ClientSession,
  ) {
    const card = await UserCard.findByIdAndUpdate(
      userCardId,
      { status, ...extra },
      { new: true, session },
    );
    return assertFound(card, "User card not found.");
  }

  static async transferOwnership(
    userCardId: string,
    fromUserId: string,
    toUserId: string,
    session?: mongoose.ClientSession,
  ) {
    const card = await UserCard.findOneAndUpdate(
      { _id: userCardId, userId: fromUserId, status: { $in: ["available", "in_trade", "listed"] } },
      {
        userId: toUserId,
        status: "available",
        listingId: undefined,
        tradeId: undefined,
        lockedReason: undefined,
      },
      { new: true, session },
    );
    if (!card) {
      throw new DomainError("CONFLICT", "Failed to transfer card ownership.");
    }
    await User.findByIdAndUpdate(
      fromUserId,
      { $inc: { "stats.cardsOwned": -1 } },
      { session },
    );
    await User.findByIdAndUpdate(
      toUserId,
      { $inc: { "stats.cardsOwned": 1 } },
      { session },
    );
    await this.refreshCollectionStats(fromUserId, session);
    await this.refreshCollectionStats(toUserId, session);
    return card;
  }

  static async refreshCollectionStats(
    userId: string,
    session?: mongoose.ClientSession,
  ) {
    const owned = await UserCard.distinct("cardDefinitionId", {
      userId,
      status: { $ne: "locked" },
    }).session(session ?? null);

    await User.findByIdAndUpdate(
      userId,
      { $set: { "stats.collectionUnique": owned.length } },
      { session },
    );

    const sets = await CollectionSet.find().session(session ?? null);
    for (const set of sets) {
      const ids = new Set(set.cardDefinitionIds.map(String));
      const ownedUnique = owned.filter((id) => ids.has(String(id))).length;
      await UserCollectionProgress.findOneAndUpdate(
        { userId, setId: set.setId },
        {
          userId,
          setId: set.setId,
          ownedUnique,
          total: set.cardDefinitionIds.length,
          completedAt:
            ownedUnique >= set.cardDefinitionIds.length && set.cardDefinitionIds.length > 0
              ? new Date()
              : null,
        },
        { upsert: true, session },
      );
    }
  }
}
