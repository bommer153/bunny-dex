import { Quest, UserQuest } from "@bunnydex/database";
import { EconomyService } from "./economy-service.js";
import { InventoryService } from "./inventory-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";
import { DomainError } from "../errors.js";

function periodKey(period: string) {
  const d = new Date();
  if (period === "weekly") {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7,
    );
    return `${d.getFullYear()}-W${week}`;
  }
  if (period === "once") return "once";
  return d.toISOString().slice(0, 10);
}

export class QuestService {
  static registerListeners() {
    EventBus.on("hunt.completed", async (p) => this.progress(String(p.userId), "hunt", 1));
    EventBus.on("battle.won", async (p) => this.progress(String(p.userId), "battle_win", 1));
    EventBus.on("pack.opened", async (p) => this.progress(String(p.userId), "pack_open", 1));
    EventBus.on("gamble.won", async (p) => this.progress(String(p.userId), "gamble_win", 1));
    EventBus.on("shop.purchased", async (p) => this.progress(String(p.userId), "shop_buy", 1));
    EventBus.on("trade.completed", async (p) => {
      await this.progress(String(p.initiatorId), "trade", 1);
      await this.progress(String(p.partnerId), "trade", 1);
    });
  }

  static async ensureAssigned(userId: string) {
    const quests = await Quest.find({ enabled: true, period: "daily" });
    for (const q of quests) {
      const key = periodKey(q.period);
      await UserQuest.findOneAndUpdate(
        { userId, questId: q._id, periodKey: key },
        {
          $setOnInsert: {
            userId,
            questId: q._id,
            periodKey: key,
            progress: 0,
          },
        },
        { upsert: true },
      );
    }
  }

  static async list(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    await this.ensureAssigned(String(user._id));
    const quests = await Quest.find({ enabled: true }).lean();
    const userQuests = await UserQuest.find({ userId: user._id }).lean();
    return quests.map((q) => {
      const key = periodKey(q.period);
      const uq = userQuests.find(
        (x) => String(x.questId) === String(q._id) && x.periodKey === key,
      );
      return {
        ...q,
        progress: uq?.progress ?? 0,
        completed: Boolean(uq?.completedAt),
        claimed: Boolean(uq?.claimedAt),
        periodKey: key,
      };
    });
  }

  static async progress(userId: string, criteriaType: string, amount: number) {
    await this.ensureAssigned(userId);
    const quests = await Quest.find({ enabled: true, "criteria.type": criteriaType });
    for (const q of quests) {
      const key = periodKey(q.period);
      const uq = await UserQuest.findOne({ userId, questId: q._id, periodKey: key });
      if (!uq || uq.completedAt) continue;
      uq.progress = Math.min(q.criteria?.target ?? 0, uq.progress + amount);
      if (uq.progress >= (q.criteria?.target ?? 0)) {
        uq.completedAt = new Date();
      }
      await uq.save();
    }
  }

  static async claim(discordId: string, questSlug: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const quest = await Quest.findOne({ slug: questSlug });
    if (!quest) throw new DomainError("NOT_FOUND", "Quest not found.");
    const key = periodKey(quest.period);
    const uq = await UserQuest.findOne({
      userId: user._id,
      questId: quest._id,
      periodKey: key,
    });
    if (!uq?.completedAt) throw new DomainError("INVALID_STATE", "Quest not completed.");
    if (uq.claimedAt) throw new DomainError("CONFLICT", "Already claimed.");

    const r = quest.rewards ?? {};
    if (r.coins) {
      await EconomyService.credit({
        userId: String(user._id),
        currency: "coins",
        amount: r.coins,
        type: "quest",
        idempotencyKey: `quest:${quest.slug}:${user._id}:${key}:coins`,
      });
    }
    if (r.gems) {
      await EconomyService.credit({
        userId: String(user._id),
        currency: "gems",
        amount: r.gems,
        type: "quest",
        idempotencyKey: `quest:${quest.slug}:${user._id}:${key}:gems`,
      });
    }
    if (r.tickets) {
      await EconomyService.credit({
        userId: String(user._id),
        currency: "tickets",
        amount: r.tickets,
        type: "quest",
        idempotencyKey: `quest:${quest.slug}:${user._id}:${key}:tickets`,
      });
    }
    if (r.xp) await UserService.addXp(String(user._id), r.xp);
    if (r.itemSlug) {
      await InventoryService.grantItem({
        userId: String(user._id),
        itemSlug: r.itemSlug,
        quantity: r.itemQty ?? 1,
      });
    }
    uq.claimedAt = new Date();
    await uq.save();
    return { quest, rewards: r };
  }
}
