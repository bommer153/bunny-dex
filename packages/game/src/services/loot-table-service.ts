import { LootTable, CardVariant } from "@bunnydex/database";
import type { Variant } from "@bunnydex/types";
import { assertFound, DomainError } from "../errors.js";
import { CardCatalogService } from "./card-catalog-service.js";
import { CardService } from "./card-service.js";
import { EconomyService } from "./economy-service.js";
import { InventoryService } from "./inventory-service.js";
import type { AcquisitionSource } from "@bunnydex/types";

export type LootReward =
  | { kind: "coins"; amount: number }
  | { kind: "gems"; amount: number }
  | { kind: "tickets"; amount: number }
  | { kind: "item"; itemSlug: string; quantity: number }
  | {
      kind: "card";
      rarity?: string;
      rarityMin?: string;
      setId?: string;
      element?: string;
      variantWeights?: Record<string, number>;
    }
  | { kind: "pack"; packSlug: string }
  | { kind: "box"; itemSlug: string };

export type ResolvedLoot =
  | { type: "coins"; amount: number }
  | { type: "gems"; amount: number }
  | { type: "tickets"; amount: number }
  | { type: "item"; itemSlug: string; quantity: number; stackId?: string }
  | {
      type: "card";
      userCardId: string;
      cardDefinitionId: string;
      name: string;
      rarity: string;
      variant: Variant;
    };

function weightedPick<T extends { weight: number }>(entries: T[]): T {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1]!;
}

export class LootTableService {
  static async getTable(slug: string) {
    return assertFound(await LootTable.findOne({ slug }), `Loot table ${slug} not found.`);
  }

  static async rollReward(
    slug: string,
    modifiers?: { rareBonusBps?: number; forcePity?: boolean },
  ): Promise<LootReward> {
    const table = await this.getTable(slug);
    if (modifiers?.forcePity && table.pity?.guaranteeReward) {
      return table.pity.guaranteeReward as LootReward;
    }

    let entries = (table.entries as Array<{ weight: number; reward: LootReward }>).map(
      (e: { weight: number; reward: LootReward }) => ({
        weight: e.weight,
        reward: e.reward,
      }),
    );

    if (modifiers?.rareBonusBps) {
      const bonus = 1 + modifiers.rareBonusBps / 10_000;
      entries = entries.map((e: { weight: number; reward: LootReward }) => {
        if (
          e.reward.kind === "card" &&
          e.reward.rarity &&
          !["common", "uncommon"].includes(e.reward.rarity)
        ) {
          return { ...e, weight: e.weight * bonus };
        }
        return e;
      });
    }

    if (!entries.length) {
      throw new DomainError("INVALID_STATE", "Loot table is empty.");
    }
    return weightedPick(entries).reward;
  }

  static async rollVariant(weights?: Record<string, number>, variantBonusBps = 0): Promise<Variant> {
    const variants = await CardVariant.find().lean();
    const entries = variants.map((v) => {
      let weight = weights?.[v.code] ?? v.huntWeightMod;
      if (v.code !== "normal" && variantBonusBps) {
        weight *= 1 + variantBonusBps / 10_000;
      }
      return { weight, code: v.code as Variant };
    });
    return weightedPick(entries).code;
  }

  static async applyReward(input: {
    userId: string;
    reward: LootReward;
    source: AcquisitionSource;
    idempotencyPrefix: string;
    variantBonusBps?: number;
  }): Promise<ResolvedLoot> {
    const { userId, reward, source, idempotencyPrefix } = input;

    switch (reward.kind) {
      case "coins":
        await EconomyService.credit({
          userId,
          currency: "coins",
          amount: reward.amount,
          type: `${source}_loot`,
          idempotencyKey: `${idempotencyPrefix}:coins`,
          refType: source,
        });
        return { type: "coins", amount: reward.amount };
      case "gems":
        await EconomyService.credit({
          userId,
          currency: "gems",
          amount: reward.amount,
          type: `${source}_loot`,
          idempotencyKey: `${idempotencyPrefix}:gems`,
          refType: source,
        });
        return { type: "gems", amount: reward.amount };
      case "tickets":
        await EconomyService.credit({
          userId,
          currency: "tickets",
          amount: reward.amount,
          type: `${source}_loot`,
          idempotencyKey: `${idempotencyPrefix}:tickets`,
          refType: source,
        });
        return { type: "tickets", amount: reward.amount };
      case "item":
      case "box": {
        const slug = reward.kind === "box" ? reward.itemSlug : reward.itemSlug;
        const qty = reward.kind === "item" ? reward.quantity : 1;
        const stack = await InventoryService.grantItem({
          userId,
          itemSlug: slug,
          quantity: qty,
        });
        return { type: "item", itemSlug: slug, quantity: qty, stackId: String(stack._id) };
      }
      case "pack": {
        const stack = await InventoryService.grantItem({
          userId,
          itemSlug: "pack-ticket",
          quantity: 1,
        });
        return {
          type: "item",
          itemSlug: "pack-ticket",
          quantity: 1,
          stackId: String(stack._id),
        };
      }
      case "card": {
        const def = await CardCatalogService.pickRandomCard({
          rarity: reward.rarity as never,
          rarityMin: reward.rarityMin as never,
          setId: reward.setId,
          element: reward.element as never,
        });
        const variant = await this.rollVariant(
          reward.variantWeights,
          input.variantBonusBps,
        );
        const userCard = await CardService.grantCard({
          userId,
          cardDefinitionId: String(def._id),
          variant,
          acquiredFrom: source,
        });
        return {
          type: "card",
          userCardId: String(userCard._id),
          cardDefinitionId: String(def._id),
          name: def.name,
          rarity: def.rarity,
          variant,
        };
      }
      default:
        throw new DomainError("VALIDATION", "Unknown loot reward kind.");
    }
  }
}
