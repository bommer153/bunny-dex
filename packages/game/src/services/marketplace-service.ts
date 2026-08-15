import mongoose from "mongoose";
import {
  CardDefinition,
  CardMarketStats,
  MarketplaceListing,
  MarketplaceTransaction,
  User,
  UserCard,
} from "@bunnydex/database";
import { randomUUID } from "node:crypto";
import { DomainError, assertFound } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { CardService } from "./card-service.js";
import { EconomyService } from "./economy-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";

export class MarketplaceService {
  static async search(filters: {
    q?: string;
    rarity?: string;
    element?: string;
    variant?: string;
    maxPrice?: number;
    limit?: number;
  }) {
    const query: Record<string, unknown> = { status: "active", expiresAt: { $gt: new Date() } };
    if (filters.rarity) query.rarity = filters.rarity;
    if (filters.element) query.element = filters.element;
    if (filters.variant) query.variant = filters.variant;
    if (filters.maxPrice) query.priceCoins = { $lte: filters.maxPrice };
    if (filters.q) query.$text = { $search: filters.q };

    return MarketplaceListing.find(query)
      .sort({ priceCoins: 1 })
      .limit(filters.limit ?? 25)
      .lean();
  }

  static async listMine(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    return MarketplaceListing.find({ sellerId: user._id, status: "active" }).lean();
  }

  static async sellCard(discordId: string, userCardId: string, priceCoins: number) {
    const user = await UserService.requireByDiscordId(discordId);
    const config = await ConfigService.get();
    if (priceCoins < 1) throw new DomainError("VALIDATION", "Invalid price.");

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const card = await UserCard.findOne({
        _id: userCardId,
        userId: user._id,
        status: "available",
      }).session(session);
      if (!card) throw new DomainError("NOT_FOUND", "Card not available.");

      const def = assertFound(
        await CardDefinition.findById(card.cardDefinitionId).session(session),
        "Card definition missing.",
      );

      const expiresAt = new Date(
        Date.now() + config.listingDefaultTtlHours * 3600_000,
      );
      const [listing] = await MarketplaceListing.create(
        [
          {
            sellerId: user._id,
            assetType: "card",
            userCardId: card._id,
            cardDefinitionId: def._id,
            priceCoins,
            status: "active",
            expiresAt,
            feeBpsSnapshot: config.marketplaceFeeBps,
            name: def.name,
            rarity: def.rarity,
            element: def.element,
            variant: card.variant,
          },
        ],
        { session },
      );

      await CardService.setStatus(
        String(card._id),
        "listed",
        { listingId: listing!._id },
        session,
      );

      await CardMarketStats.findOneAndUpdate(
        { cardDefinitionId: def._id, variant: card.variant },
        { $min: { lowestListing: priceCoins }, $set: { computedAt: new Date() } },
        { upsert: true, session },
      );

      await session.commitTransaction();
      return listing!;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  static async buy(discordId: string, listingId: string) {
    const buyer = await UserService.requireByDiscordId(discordId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const listing = await MarketplaceListing.findOne({
        _id: listingId,
        status: "active",
        expiresAt: { $gt: new Date() },
      }).session(session);
      if (!listing) throw new DomainError("NOT_FOUND", "Listing not available.");
      if (String(listing.sellerId) === String(buyer._id)) {
        throw new DomainError("VALIDATION", "Cannot buy your own listing.");
      }

      const fee = Math.floor((listing.priceCoins * listing.feeBpsSnapshot) / 10_000);
      const sellerNet = listing.priceCoins - fee;

      await EconomyService.debit({
        userId: String(buyer._id),
        currency: "coins",
        amount: listing.priceCoins,
        type: "market_buy",
        idempotencyKey: `market-buy:${listingId}:${buyer._id}`,
        counterpartyId: String(listing.sellerId),
        session,
      });
      await EconomyService.credit({
        userId: String(listing.sellerId),
        currency: "coins",
        amount: sellerNet,
        type: "market_sell",
        idempotencyKey: `market-sell:${listingId}`,
        counterpartyId: String(buyer._id),
        session,
      });
      // fee coins are sunk (not credited) — inflation control

      if (listing.assetType === "card" && listing.userCardId) {
        await CardService.transferOwnership(
          String(listing.userCardId),
          String(listing.sellerId),
          String(buyer._id),
          session,
        );
      }

      listing.status = "sold";
      await listing.save({ session });

      await MarketplaceTransaction.create(
        [
          {
            listingId: listing._id,
            sellerId: listing.sellerId,
            buyerId: buyer._id,
            priceCoins: listing.priceCoins,
            feeCoins: fee,
            sellerNet,
            assetType: listing.assetType,
            userCardId: listing.userCardId,
            cardDefinitionId: listing.cardDefinitionId,
          },
        ],
        { session },
      );

      await User.findByIdAndUpdate(
        listing.sellerId,
        { $inc: { "stats.marketplaceSales": 1 } },
        { session },
      );

      if (listing.cardDefinitionId) {
        const stats = await CardMarketStats.findOne({
          cardDefinitionId: listing.cardDefinitionId,
          variant: listing.variant ?? "normal",
        }).session(session);
        const recent = [
          ...((stats?.recentSales as number[] | undefined) ?? []),
          listing.priceCoins,
        ].slice(-20);
        const avg = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
        await CardMarketStats.findOneAndUpdate(
          {
            cardDefinitionId: listing.cardDefinitionId,
            variant: listing.variant ?? "normal",
          },
          {
            $set: {
              avgSale: avg,
              highSale: Math.max(stats?.highSale ?? 0, listing.priceCoins),
              lastSaleAt: new Date(),
              recentSales: recent,
              computedAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      }

      await session.commitTransaction();
      await EventBus.emit("market.sold", {
        listingId,
        buyerId: String(buyer._id),
        sellerId: String(listing.sellerId),
      });
      return { listing, fee, sellerNet };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  static async cancel(discordId: string, listingId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const listing = await MarketplaceListing.findOne({
        _id: listingId,
        sellerId: user._id,
        status: "active",
      }).session(session);
      if (!listing) throw new DomainError("NOT_FOUND", "Listing not found.");
      listing.status = "cancelled";
      await listing.save({ session });
      if (listing.userCardId) {
        await CardService.setStatus(
          String(listing.userCardId),
          "available",
          { listingId: undefined, lockedReason: undefined },
          session,
        );
      }
      await session.commitTransaction();
      return listing;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  static async npcSell(discordId: string, userCardId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const config = await ConfigService.get();
    const card = await CardService.requireOwnedAvailable(String(user._id), userCardId);
    const def = assertFound(
      await CardDefinition.findById(card.cardDefinitionId),
      "Card missing.",
    );
    const amount = Math.max(
      1,
      Math.floor((def.baseValue * config.npcSellRateBps) / 10_000),
    );
    card.status = "locked";
    card.lockedReason = "npc_sold";
    await card.save();
    await EconomyService.credit({
      userId: String(user._id),
      currency: "coins",
      amount,
      type: "npc_sell",
      idempotencyKey: `npc-sell:${userCardId}:${randomUUID()}`,
    });
    await User.findByIdAndUpdate(user._id, { $inc: { "stats.cardsOwned": -1 } });
    await CardService.refreshCollectionStats(String(user._id));
    return { amount, cardName: def.name };
  }
}
