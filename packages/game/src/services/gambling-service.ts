import { User } from "@bunnydex/database";
import { randomUUID } from "node:crypto";
import { DomainError } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { EconomyService } from "./economy-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export class GamblingService {
  private static async prepareBet(discordId: string, amount: number) {
    const user = await UserService.requireByDiscordId(discordId);
    const config = await ConfigService.get();
    if (amount < config.gambleMinBet || amount > config.gambleMaxBet) {
      throw new DomainError(
        "VALIDATION",
        `Bet must be between ${config.gambleMinBet} and ${config.gambleMaxBet}.`,
      );
    }

    const now = new Date();
    const cd = config.gambleCooldownSeconds * 1000;
    const last = user.cooldowns?.lastGambleAt
      ? new Date(user.cooldowns.lastGambleAt).getTime()
      : 0;
    if (Date.now() - last < cd) {
      throw new DomainError("COOLDOWN", "Slow down on gambling.");
    }

    const key = todayKey();
    let wagered = user.gambleDaily?.dateKey === key ? user.gambleDaily.wagered : 0;
    if (wagered + amount > config.gambleDailyWagerCap) {
      throw new DomainError("RATE_LIMIT", "Daily gambling wager cap reached.");
    }

    await EconomyService.debit({
      userId: String(user._id),
      currency: "coins",
      amount,
      type: "gamble_wager",
      idempotencyKey: `gamble-wager:${user._id}:${randomUUID()}`,
    });

    await User.findByIdAndUpdate(user._id, {
      $set: {
        "cooldowns.lastGambleAt": now,
        "gambleDaily.dateKey": key,
        "gambleDaily.wagered": wagered + amount,
      },
    });

    return { user, config };
  }

  static async flip(discordId: string, amount: number, side: "heads" | "tails") {
    const { user } = await this.prepareBet(discordId, amount);
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = result === side;
    if (won) {
      await EconomyService.credit({
        userId: String(user._id),
        currency: "coins",
        amount: amount * 2,
        type: "gamble_win",
        idempotencyKey: `gamble-win:${user._id}:${randomUUID()}`,
      });
      await User.findByIdAndUpdate(user._id, { $inc: { "stats.gamblesWon": 1 } });
      await EventBus.emit("gamble.won", { userId: String(user._id) });
    }
    return { result, won, payout: won ? amount * 2 : 0 };
  }

  static async slots(discordId: string, amount: number) {
    const { user } = await this.prepareBet(discordId, amount);
    const symbols = ["🥕", "🍀", "⭐", "💎", "🐰"];
    const reels = [
      symbols[Math.floor(Math.random() * symbols.length)]!,
      symbols[Math.floor(Math.random() * symbols.length)]!,
      symbols[Math.floor(Math.random() * symbols.length)]!,
    ];
    let multiplier = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      multiplier = reels[0] === "💎" ? 10 : reels[0] === "🐰" ? 5 : 3;
    } else if (reels[0] === reels[1] || reels[1] === reels[2]) {
      multiplier = 1.5;
    }
    const payout = Math.floor(amount * multiplier);
    if (payout > 0) {
      await EconomyService.credit({
        userId: String(user._id),
        currency: "coins",
        amount: payout,
        type: "gamble_win",
        idempotencyKey: `slots-win:${user._id}:${randomUUID()}`,
      });
      await User.findByIdAndUpdate(user._id, { $inc: { "stats.gamblesWon": 1 } });
      await EventBus.emit("gamble.won", { userId: String(user._id) });
    }
    return { reels, payout, won: payout > 0 };
  }

  static async dice(discordId: string, amount: number, guess: number) {
    if (guess < 1 || guess > 6) {
      throw new DomainError("VALIDATION", "Guess must be 1-6.");
    }
    const { user } = await this.prepareBet(discordId, amount);
    const roll = 1 + Math.floor(Math.random() * 6);
    const won = roll === guess;
    const payout = won ? amount * 5 : 0;
    if (won) {
      await EconomyService.credit({
        userId: String(user._id),
        currency: "coins",
        amount: payout,
        type: "gamble_win",
        idempotencyKey: `dice-win:${user._id}:${randomUUID()}`,
      });
      await User.findByIdAndUpdate(user._id, { $inc: { "stats.gamblesWon": 1 } });
      await EventBus.emit("gamble.won", { userId: String(user._id) });
    }
    return { roll, won, payout };
  }
}
