import mongoose from "mongoose";
import { Trade, User, UserCard } from "@bunnydex/database";
import { DomainError, assertFound } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { CardService } from "./card-service.js";
import { EconomyService } from "./economy-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";

export class TradeService {
  static async create(discordId: string, partnerDiscordId: string) {
    const initiator = await UserService.requireByDiscordId(discordId);
    const partner = await UserService.requireByDiscordId(partnerDiscordId);
    if (String(initiator._id) === String(partner._id)) {
      throw new DomainError("VALIDATION", "Cannot trade with yourself.");
    }
    const config = await ConfigService.get();
    const expiresAt = new Date(Date.now() + config.tradeTtlMinutes * 60_000);
    const trade = await Trade.create({
      initiatorId: initiator._id,
      partnerId: partner._id,
      status: "open",
      expiresAt,
      initiatorOffer: { userCardIds: [], items: [], coins: 0 },
      partnerOffer: { userCardIds: [], items: [], coins: 0 },
    });
    return trade;
  }

  static async getOpenForUser(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    return Trade.findOne({
      status: { $in: ["open", "proposed", "locked"] },
      $or: [{ initiatorId: user._id }, { partnerId: user._id }],
    }).sort({ createdAt: -1 });
  }

  static async addCard(discordId: string, userCardId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const trade = assertFound(await this.getOpenForUser(discordId), "No open trade.");
    if (trade.status !== "open") {
      throw new DomainError("INVALID_STATE", "Trade is locked.");
    }
    const side =
      String(trade.initiatorId) === String(user._id) ? "initiatorOffer" : "partnerOffer";
    await CardService.requireOwnedAvailable(String(user._id), userCardId);
    await CardService.setStatus(userCardId, "in_trade", { tradeId: trade._id });
    trade[side].userCardIds.push(userCardId as never);
    trade.confirmations = { initiator: false, partner: false };
    await trade.save();
    return trade;
  }

  static async addCoins(discordId: string, amount: number) {
    const user = await UserService.requireByDiscordId(discordId);
    const trade = assertFound(await this.getOpenForUser(discordId), "No open trade.");
    if (amount < 0) throw new DomainError("VALIDATION", "Invalid coins.");
    if (user.coins < amount) throw new DomainError("INSUFFICIENT_FUNDS", "Not enough coins.");
    const side =
      String(trade.initiatorId) === String(user._id) ? "initiatorOffer" : "partnerOffer";
    trade[side].coins = amount;
    trade.confirmations = { initiator: false, partner: false };
    await trade.save();
    return trade;
  }

  static async confirm(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const trade = assertFound(await this.getOpenForUser(discordId), "No open trade.");
    if (String(trade.initiatorId) === String(user._id)) {
      trade.set("confirmations.initiator", true);
    } else {
      trade.set("confirmations.partner", true);
    }
    await trade.save();
    if (trade.confirmations?.initiator && trade.confirmations?.partner) {
      return this.settle(String(trade._id));
    }
    return { trade, settled: false };
  }

  static async cancel(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const trade = assertFound(await this.getOpenForUser(discordId), "No open trade.");
    await this.releaseLocks(trade);
    trade.status = "cancelled";
    await trade.save();
    return trade;
  }

  private static async releaseLocks(trade: InstanceType<typeof Trade>) {
    const ids = [
      ...(trade.initiatorOffer.userCardIds ?? []),
      ...(trade.partnerOffer.userCardIds ?? []),
    ];
    await UserCard.updateMany(
      { _id: { $in: ids }, status: "in_trade" },
      { $set: { status: "available" }, $unset: { tradeId: 1, lockedReason: 1 } },
    );
  }

  static async settle(tradeId: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const trade = assertFound(
        await Trade.findById(tradeId).session(session),
        "Trade not found.",
      );
      if (trade.status === "completed") {
        await session.abortTransaction();
        return { trade, settled: true, replayed: true };
      }
      if (trade.expiresAt < new Date()) {
        await this.releaseLocks(trade);
        trade.status = "expired";
        await trade.save({ session });
        await session.commitTransaction();
        throw new DomainError("INVALID_STATE", "Trade expired.");
      }

      trade.status = "locked";
      await trade.save({ session });

      // Move cards
      for (const cardId of trade.initiatorOffer.userCardIds ?? []) {
        await CardService.transferOwnership(
          String(cardId),
          String(trade.initiatorId),
          String(trade.partnerId),
          session,
        );
      }
      for (const cardId of trade.partnerOffer.userCardIds ?? []) {
        await CardService.transferOwnership(
          String(cardId),
          String(trade.partnerId),
          String(trade.initiatorId),
          session,
        );
      }

      const initCoins = trade.initiatorOffer.coins ?? 0;
      const partCoins = trade.partnerOffer.coins ?? 0;
      if (initCoins > 0) {
        await EconomyService.debit({
          userId: String(trade.initiatorId),
          currency: "coins",
          amount: initCoins,
          type: "trade_out",
          idempotencyKey: `trade-out:${tradeId}:initiator`,
          counterpartyId: String(trade.partnerId),
          session,
        });
        await EconomyService.credit({
          userId: String(trade.partnerId),
          currency: "coins",
          amount: initCoins,
          type: "trade_in",
          idempotencyKey: `trade-in:${tradeId}:partner`,
          counterpartyId: String(trade.initiatorId),
          session,
        });
      }
      if (partCoins > 0) {
        await EconomyService.debit({
          userId: String(trade.partnerId),
          currency: "coins",
          amount: partCoins,
          type: "trade_out",
          idempotencyKey: `trade-out:${tradeId}:partner`,
          counterpartyId: String(trade.initiatorId),
          session,
        });
        await EconomyService.credit({
          userId: String(trade.initiatorId),
          currency: "coins",
          amount: partCoins,
          type: "trade_in",
          idempotencyKey: `trade-in:${tradeId}:initiator`,
          counterpartyId: String(trade.partnerId),
          session,
        });
      }

      trade.status = "completed";
      await trade.save({ session });
      await User.findByIdAndUpdate(
        trade.initiatorId,
        { $inc: { "stats.tradesCompleted": 1 } },
        { session },
      );
      await User.findByIdAndUpdate(
        trade.partnerId,
        { $inc: { "stats.tradesCompleted": 1 } },
        { session },
      );

      await session.commitTransaction();
      await EventBus.emit("trade.completed", {
        tradeId,
        initiatorId: String(trade.initiatorId),
        partnerId: String(trade.partnerId),
      });
      return { trade, settled: true };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
