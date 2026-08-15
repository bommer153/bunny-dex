import { Achievement, UserAchievement, User, CardDefinition, UserCard } from "@bunnydex/database";
import { EconomyService } from "./economy-service.js";
import { InventoryService } from "./inventory-service.js";
import { EventBus } from "../event-bus.js";

export class AchievementService {
  static registerListeners() {
    EventBus.on("hunt.card", async (p) => {
      await this.check(String(p.userId), "hunt_card");
    });
    EventBus.on("card.granted", async (p) => {
      await this.check(String(p.userId), "cards_owned");
      await this.check(String(p.userId), "rarity_owned");
    });
    EventBus.on("battle.won", async (p) => {
      await this.check(String(p.userId), "wins");
    });
  }

  static async listForUser(userId: string) {
    const all = await Achievement.find({ enabled: true }).lean();
    const unlocked = await UserAchievement.find({ userId }).lean();
    const unlockedIds = new Set(unlocked.map((u) => String(u.achievementId)));
    return all.map((a) => ({
      ...a,
      unlocked: unlockedIds.has(String(a._id)),
      unlockedAt: unlocked.find((u) => String(u.achievementId) === String(a._id))
        ?.unlockedAt,
    }));
  }

  static async check(userId: string, criteriaType: string) {
    const achievements = await Achievement.find({
      enabled: true,
      "criteria.type": criteriaType,
    });
    for (const a of achievements) {
      const already = await UserAchievement.findOne({
        userId,
        achievementId: a._id,
      });
      if (already) continue;

      const progress = await this.measure(userId, a.criteria?.type ?? "");
      if (progress >= (a.criteria?.target ?? Infinity)) {
        await this.unlock(userId, a);
      }
    }
  }

  private static async measure(userId: string, type: string): Promise<number> {
    const user = await User.findById(userId);
    if (!user) return 0;
    switch (type) {
      case "hunt_card":
        return UserCard.countDocuments({ userId, acquiredFrom: "hunt" });
      case "cards_owned":
        return user.stats?.cardsOwned ?? 0;
      case "wins":
        return user.stats?.wins ?? 0;
      case "coins_balance":
        return user.coins;
      case "rarity_owned": {
        const defs = await UserCard.distinct("cardDefinitionId", { userId });
        return CardDefinition.countDocuments({
          _id: { $in: defs },
          rarity: { $in: ["legendary", "mythic", "secret"] },
        });
      }
      default:
        return 0;
    }
  }

  private static async unlock(
    userId: string,
    achievement: InstanceType<typeof Achievement>,
  ) {
    try {
      await UserAchievement.create({
        userId,
        achievementId: achievement._id,
        unlockedAt: new Date(),
      });
    } catch {
      return;
    }

    const r = achievement.rewards ?? {};
    if (r.coins) {
      await EconomyService.credit({
        userId,
        currency: "coins",
        amount: r.coins,
        type: "achievement",
        idempotencyKey: `ach:${achievement.slug}:${userId}:coins`,
      });
    }
    if (r.gems) {
      await EconomyService.credit({
        userId,
        currency: "gems",
        amount: r.gems,
        type: "achievement",
        idempotencyKey: `ach:${achievement.slug}:${userId}:gems`,
      });
    }
    if (r.itemSlug) {
      await InventoryService.grantItem({
        userId,
        itemSlug: r.itemSlug,
        quantity: 1,
      });
    }

    const updates: Record<string, unknown> = {
      $inc: { "stats.achievementScore": achievement.score ?? 10 },
    };
    if (r.title) updates.$addToSet = { ...(updates.$addToSet as object), titles: r.title };
    if (r.badge) {
      updates.$addToSet = { ...(updates.$addToSet as object), badges: r.badge };
    }
    await User.findByIdAndUpdate(userId, updates);
  }
}
