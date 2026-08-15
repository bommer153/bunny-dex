import { Pack, User } from "@bunnydex/database";
import { randomUUID } from "node:crypto";
import { assertFound, DomainError } from "../errors.js";
import { EconomyService } from "./economy-service.js";
import { LootTableService } from "./loot-table-service.js";
import { CardCatalogService } from "./card-catalog-service.js";
import { CardService } from "./card-service.js";
import type { Rarity, Variant } from "@bunnydex/types";
import { EventBus } from "../event-bus.js";
import { UserService } from "./user-service.js";

function weightedPick(weights: Record<string, number>): string {
  const entries = Object.entries(weights).map(([k, weight]) => ({ k, weight }));
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.k;
  }
  return entries[entries.length - 1]!.k;
}

export class PackService {
  static async list() {
    return Pack.find({ enabled: true }).lean();
  }

  static async get(slug: string) {
    return assertFound(await Pack.findOne({ slug, enabled: true }), "Pack not found.");
  }

  static async purchaseAndOpen(discordId: string, packSlug: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const pack = await this.get(packSlug);
    const currency = pack.cost.currency as "coins" | "gems" | "tickets";
    const idem = `pack-buy:${user._id}:${packSlug}:${randomUUID()}`;

    await EconomyService.debit({
      userId: String(user._id),
      currency,
      amount: pack.cost.amount,
      type: "pack_purchase",
      idempotencyKey: idem,
      refType: "pack",
      refId: packSlug,
    });

    return this.openForUser(String(user._id), packSlug, `pack-open:${idem}`);
  }

  static async openForUser(userId: string, packSlug: string, idempotencyPrefix: string) {
    const pack = await this.get(packSlug);
    const rarityWeights = Object.fromEntries(
      pack.rarityWeights instanceof Map
        ? pack.rarityWeights.entries()
        : Object.entries(pack.rarityWeights ?? {}),
    ) as Record<string, number>;

    const variantWeights = Object.fromEntries(
      pack.variantWeights instanceof Map
        ? pack.variantWeights.entries()
        : Object.entries(pack.variantWeights ?? { normal: 1 }),
    ) as Record<string, number>;

    const results = [];
    const guaranteed = [...(pack.guarantees ?? [])];

    for (let i = 0; i < pack.cardCount; i++) {
      let rarity = weightedPick(rarityWeights) as Rarity;
      const gIdx = guaranteed.findIndex((g) => (g.count ?? 0) > 0);
      if (gIdx >= 0) {
        rarity = guaranteed[gIdx]!.rarity as Rarity;
        guaranteed[gIdx]!.count = (guaranteed[gIdx]!.count ?? 1) - 1;
      }

      const def = await CardCatalogService.pickRandomCard({
        rarity,
        setIds: pack.pool?.setIds,
        element: pack.pool?.elements?.[0] as never,
      });
      const variant = (await LootTableService.rollVariant(variantWeights)) as Variant;
      const userCard = await CardService.grantCard({
        userId,
        cardDefinitionId: String(def._id),
        variant,
        acquiredFrom: "pack",
      });
      results.push({
        userCardId: String(userCard._id),
        name: def.name,
        rarity: def.rarity,
        variant,
        slug: def.slug,
      });
    }

    await User.findByIdAndUpdate(userId, { $inc: { "stats.packsOpened": 1 } });
    await EventBus.emit("pack.opened", { userId, packSlug, results });
    return { pack, cards: results };
  }
}
