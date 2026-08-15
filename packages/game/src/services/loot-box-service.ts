import { randomUUID } from "node:crypto";
import { InventoryService } from "./inventory-service.js";
import { LootTableService } from "./loot-table-service.js";
import { UserService } from "./user-service.js";
import { DomainError } from "../errors.js";

export class LootBoxService {
  static async open(discordId: string, itemSlug: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const used = await InventoryService.useItem(String(user._id), itemSlug);
    if (used.kind !== "loot_box" || !used.lootTableSlug) {
      throw new DomainError("VALIDATION", "That item is not a loot box.");
    }

    const reward = await LootTableService.rollReward(used.lootTableSlug);
    const resolved = await LootTableService.applyReward({
      userId: String(user._id),
      reward,
      source: "loot_box",
      idempotencyPrefix: `box:${user._id}:${itemSlug}:${randomUUID()}`,
    });

    return { item: used.def, reward: resolved };
  }
}
