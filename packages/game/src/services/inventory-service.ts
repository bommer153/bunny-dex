import { ItemDefinition, InventoryStack } from "@bunnydex/database";
import { assertFound, DomainError } from "../errors.js";
import type mongoose from "mongoose";

export class InventoryService {
  static async grantItem(input: {
    userId: string;
    itemSlug: string;
    quantity: number;
    session?: mongoose.ClientSession;
  }) {
    const def = assertFound(
      await ItemDefinition.findOne({ slug: input.itemSlug }).session(input.session ?? null),
      `Item ${input.itemSlug} not found.`,
    );

    const stack = await InventoryStack.findOneAndUpdate(
      { userId: input.userId, itemDefinitionId: def._id },
      {
        $inc: { quantity: input.quantity },
        $setOnInsert: { userId: input.userId, itemDefinitionId: def._id },
      },
      { upsert: true, new: true, session: input.session },
    );
    return stack!;
  }

  static async list(userId: string) {
    return InventoryStack.find({ userId, quantity: { $gt: 0 } })
      .populate("itemDefinitionId")
      .lean();
  }

  static async consume(input: {
    userId: string;
    itemSlug: string;
    quantity: number;
    session?: mongoose.ClientSession;
  }) {
    const def = assertFound(
      await ItemDefinition.findOne({ slug: input.itemSlug }),
      `Item ${input.itemSlug} not found.`,
    );
    const stack = await InventoryStack.findOneAndUpdate(
      {
        userId: input.userId,
        itemDefinitionId: def._id,
        quantity: { $gte: input.quantity },
      },
      { $inc: { quantity: -input.quantity } },
      { new: true, session: input.session },
    );
    if (!stack) {
      throw new DomainError("INSUFFICIENT_FUNDS", `Not enough ${def.name}.`);
    }
    return { def, stack };
  }

  static async useItem(userId: string, itemSlug: string) {
    const { def, stack } = await this.consume({ userId, itemSlug, quantity: 1 });
    const effect = def.effect as {
      type: string;
      rareBonusBps?: number;
      variantBonusBps?: number;
      cooldownReduceSeconds?: number;
      huntsRemaining?: number;
      lootTableSlug?: string;
    };

    if (effect.type === "loot_box" || def.category === "loot_box") {
      return { kind: "loot_box" as const, def, lootTableSlug: def.lootTableSlug ?? effect.lootTableSlug };
    }

    if (effect.type === "hunt_modifier") {
      const effects = [
        ...(stack.activeEffects ?? []).map((e) => ({
          type: e.type ?? undefined,
          rareBonusBps: e.rareBonusBps ?? undefined,
          variantBonusBps: e.variantBonusBps ?? undefined,
          cooldownReduceSeconds: e.cooldownReduceSeconds ?? undefined,
          huntsRemaining: e.huntsRemaining ?? undefined,
          expiresAt: e.expiresAt ?? undefined,
        })),
        {
          type: "hunt_modifier",
          rareBonusBps: effect.rareBonusBps ?? 0,
          variantBonusBps: effect.variantBonusBps ?? 0,
          cooldownReduceSeconds: effect.cooldownReduceSeconds ?? 0,
          huntsRemaining: effect.huntsRemaining ?? 1,
        },
      ];
      stack.set("activeEffects", effects);
      await stack.save();
      return { kind: "activated" as const, def, effect };
    }

    return { kind: "consumed" as const, def };
  }

  static async getActiveHuntModifiers(userId: string) {
    const stacks = await InventoryStack.find({
      userId,
      "activeEffects.0": { $exists: true },
    });
    let rareBonusBps = 0;
    let variantBonusBps = 0;
    let cooldownReduceSeconds = 0;

    for (const stack of stacks) {
      for (const effect of stack.activeEffects ?? []) {
        if (effect.type !== "hunt_modifier") continue;
        rareBonusBps += effect.rareBonusBps ?? 0;
        variantBonusBps += effect.variantBonusBps ?? 0;
        cooldownReduceSeconds += effect.cooldownReduceSeconds ?? 0;
      }
    }
    return { rareBonusBps, variantBonusBps, cooldownReduceSeconds, stacks };
  }

  static async tickHuntModifiers(userId: string) {
    const stacks = await InventoryStack.find({
      userId,
      "activeEffects.huntsRemaining": { $gt: 0 },
    });
    for (const stack of stacks) {
      const next = (stack.activeEffects ?? [])
        .map((e) => ({
          type: e.type ?? "hunt_modifier",
          rareBonusBps: e.rareBonusBps ?? 0,
          variantBonusBps: e.variantBonusBps ?? 0,
          cooldownReduceSeconds: 0,
          huntsRemaining: Math.max(0, (e.huntsRemaining ?? 1) - 1),
          expiresAt: e.expiresAt,
        }))
        .filter((e) => (e.huntsRemaining ?? 0) > 0);
      stack.set("activeEffects", next);
      await stack.save();
    }
  }
}
