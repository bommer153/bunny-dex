import { User } from "@bunnydex/database";
import { DomainError } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { InventoryService } from "./inventory-service.js";
import { LootTableService } from "./loot-table-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";
import { randomUUID } from "node:crypto";

export class HuntService {
  static async hunt(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    if (user.flags?.banned) {
      throw new DomainError("FORBIDDEN", "Banned players cannot hunt.");
    }

    const config = await ConfigService.get();
    const modifiers = await InventoryService.getActiveHuntModifiers(String(user._id));
    const cooldownMs =
      Math.max(5, config.huntCooldownSeconds - modifiers.cooldownReduceSeconds) * 1000;
    const now = new Date();
    const threshold = new Date(now.getTime() - cooldownMs);

    const claimed = await User.findOneAndUpdate(
      {
        _id: user._id,
        $or: [
          { "cooldowns.lastHuntAt": { $exists: false } },
          { "cooldowns.lastHuntAt": null },
          { "cooldowns.lastHuntAt": { $lte: threshold } },
        ],
      },
      {
        $set: { "cooldowns.lastHuntAt": now },
        $inc: { "stats.hunts": 1, "pity.hunt": 1 },
      },
      { new: true },
    );

    if (!claimed) {
      const last = user.cooldowns?.lastHuntAt
        ? new Date(user.cooldowns.lastHuntAt).getTime()
        : 0;
      const remaining = Math.ceil((last + cooldownMs - Date.now()) / 1000);
      throw new DomainError("COOLDOWN", `Hunt cooling down. Try again in ${remaining}s.`, {
        remainingSeconds: remaining,
      });
    }

    const pityHit = (claimed.pity?.hunt ?? 0) >= config.pityHuntThreshold;
    const reward = await LootTableService.rollReward(config.huntLootTableSlug, {
      rareBonusBps: modifiers.rareBonusBps,
      forcePity: pityHit,
    });

    if (pityHit) {
      await User.findByIdAndUpdate(user._id, { $set: { "pity.hunt": 0 } });
    }

    const idempotencyPrefix = `hunt:${user._id}:${now.toISOString()}:${randomUUID()}`;
    const resolved = await LootTableService.applyReward({
      userId: String(user._id),
      reward,
      source: "hunt",
      idempotencyPrefix,
      variantBonusBps: modifiers.variantBonusBps,
    });

    await InventoryService.tickHuntModifiers(String(user._id));
    await UserService.addXp(String(user._id), config.huntXp);

    await EventBus.emit("hunt.completed", {
      userId: String(user._id),
      reward: resolved,
      pityHit,
    });

    if (resolved.type === "card") {
      await EventBus.emit("hunt.card", { userId: String(user._id), ...resolved });
    }

    const refreshed = await User.findById(user._id);
    return {
      reward: resolved,
      pityHit,
      user: refreshed,
      nextHuntAt: new Date(now.getTime() + config.huntCooldownSeconds * 1000),
    };
  }
}
