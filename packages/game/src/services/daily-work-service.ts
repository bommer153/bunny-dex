import { User } from "@bunnydex/database";
import { DomainError } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { EconomyService } from "./economy-service.js";
import { UserService } from "./user-service.js";
import { randomUUID } from "node:crypto";

function claimCooldown(
  field: "lastDailyAt" | "lastWorkAt",
  cooldownSeconds: number,
) {
  const now = new Date();
  const threshold = new Date(now.getTime() - cooldownSeconds * 1000);
  return { now, threshold, field };
}

export class DailyService {
  static async claim(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const config = await ConfigService.get();
    const { now, threshold } = claimCooldown("lastDailyAt", config.dailyCooldownSeconds);

    const claimed = await User.findOneAndUpdate(
      {
        _id: user._id,
        $or: [
          { "cooldowns.lastDailyAt": { $exists: false } },
          { "cooldowns.lastDailyAt": null },
          { "cooldowns.lastDailyAt": { $lte: threshold } },
        ],
      },
      { $set: { "cooldowns.lastDailyAt": now } },
      { new: true },
    );

    if (!claimed) {
      throw new DomainError("COOLDOWN", "Daily already claimed. Come back tomorrow.");
    }

    await EconomyService.credit({
      userId: String(user._id),
      currency: "coins",
      amount: config.dailyRewardCoins,
      type: "daily",
      idempotencyKey: `daily:${user._id}:${now.toISOString().slice(0, 10)}`,
    });

    await UserService.addXp(String(user._id), 30);
    return { coins: config.dailyRewardCoins };
  }
}

export class WorkService {
  static async work(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const config = await ConfigService.get();
    const { now, threshold } = claimCooldown("lastWorkAt", config.workCooldownSeconds);

    const claimed = await User.findOneAndUpdate(
      {
        _id: user._id,
        $or: [
          { "cooldowns.lastWorkAt": { $exists: false } },
          { "cooldowns.lastWorkAt": null },
          { "cooldowns.lastWorkAt": { $lte: threshold } },
        ],
      },
      { $set: { "cooldowns.lastWorkAt": now } },
      { new: true },
    );

    if (!claimed) {
      throw new DomainError("COOLDOWN", "You are tired. Rest before working again.");
    }

    const amount =
      config.workRewardMin +
      Math.floor(Math.random() * (config.workRewardMax - config.workRewardMin + 1));

    await EconomyService.credit({
      userId: String(user._id),
      currency: "coins",
      amount,
      type: "work",
      idempotencyKey: `work:${user._id}:${randomUUID()}`,
    });

    return { coins: amount };
  }
}
