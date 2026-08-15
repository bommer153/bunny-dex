import {
  AdminAuditLog,
  User,
  ItemDefinition,
  CardDefinition,
} from "@bunnydex/database";
import { DomainError } from "../errors.js";
import { EconomyService } from "./economy-service.js";
import { CardService } from "./card-service.js";
import { InventoryService } from "./inventory-service.js";
import { ConfigService } from "./config-service.js";
import { UserService } from "./user-service.js";
import { CardCatalogService } from "./card-catalog-service.js";
import { randomUUID } from "node:crypto";
import type { Currency, Variant } from "@bunnydex/types";

export class AdminService {
  static async assertAdmin(discordId: string, adminIds: Set<string>) {
    const user = await UserService.requireByDiscordId(discordId);
    if (!user.flags?.isAdmin && !adminIds.has(discordId)) {
      throw new DomainError("FORBIDDEN", "Admin only.");
    }
    return user;
  }

  static async log(actorId: string, actorDiscordId: string, action: string, payload: unknown) {
    await AdminAuditLog.create({
      actorId,
      actorDiscordId,
      action,
      payload,
    });
  }

  static async giveCurrency(
    actorDiscordId: string,
    targetDiscordId: string,
    currency: Currency,
    amount: number,
    adminIds: Set<string>,
  ) {
    const actor = await this.assertAdmin(actorDiscordId, adminIds);
    const target = await UserService.requireByDiscordId(targetDiscordId);
    await EconomyService.credit({
      userId: String(target._id),
      currency,
      amount,
      type: "admin_grant",
      idempotencyKey: `admin:${actor._id}:${currency}:${randomUUID()}`,
      meta: { actorDiscordId },
    });
    await this.log(String(actor._id), actorDiscordId, "give_currency", {
      targetDiscordId,
      currency,
      amount,
    });
    return target;
  }

  static async giveCard(
    actorDiscordId: string,
    targetDiscordId: string,
    cardSlug: string,
    variant: Variant,
    adminIds: Set<string>,
  ) {
    const actor = await this.assertAdmin(actorDiscordId, adminIds);
    const target = await UserService.requireByDiscordId(targetDiscordId);
    const def = await CardCatalogService.getBySlugOrId(cardSlug);
    const card = await CardService.grantCard({
      userId: String(target._id),
      cardDefinitionId: String(def._id),
      variant,
      acquiredFrom: "admin",
    });
    await this.log(String(actor._id), actorDiscordId, "give_card", {
      targetDiscordId,
      cardSlug,
      variant,
    });
    return card;
  }

  static async giveItem(
    actorDiscordId: string,
    targetDiscordId: string,
    itemSlug: string,
    quantity: number,
    adminIds: Set<string>,
  ) {
    const actor = await this.assertAdmin(actorDiscordId, adminIds);
    const target = await UserService.requireByDiscordId(targetDiscordId);
    const stack = await InventoryService.grantItem({
      userId: String(target._id),
      itemSlug,
      quantity,
    });
    await this.log(String(actor._id), actorDiscordId, "give_item", {
      targetDiscordId,
      itemSlug,
      quantity,
    });
    return stack;
  }

  static async ban(
    actorDiscordId: string,
    targetDiscordId: string,
    banned: boolean,
    adminIds: Set<string>,
  ) {
    const actor = await this.assertAdmin(actorDiscordId, adminIds);
    const target = await UserService.requireByDiscordId(targetDiscordId);
    target.flags = {
      banned,
      isAdmin: Boolean(target.flags?.isAdmin),
    };
    await target.save();
    await this.log(String(actor._id), actorDiscordId, banned ? "ban" : "unban", {
      targetDiscordId,
    });
    return target;
  }

  static async patchConfig(
    actorDiscordId: string,
    values: Record<string, unknown>,
    adminIds: Set<string>,
  ) {
    const actor = await this.assertAdmin(actorDiscordId, adminIds);
    const next = await ConfigService.patch(values as never);
    await this.log(String(actor._id), actorDiscordId, "config_patch", values);
    return next;
  }

  static async inspect(actorDiscordId: string, targetDiscordId: string, adminIds: Set<string>) {
    await this.assertAdmin(actorDiscordId, adminIds);
    return UserService.requireByDiscordId(targetDiscordId);
  }

  static async listAudit(limit = 50) {
    return AdminAuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  }

  static async upsertCard(actorDiscordId: string, data: Record<string, unknown>, adminIds: Set<string>) {
    const actor = await this.assertAdmin(actorDiscordId, adminIds);
    let doc;
    if (data._id) {
      doc = await CardDefinition.findByIdAndUpdate(data._id, data, { new: true });
    } else {
      doc = await CardDefinition.create(data);
    }
    await this.log(String(actor._id), actorDiscordId, "upsert_card", { slug: data.slug });
    return doc;
  }

  static async listItems() {
    return ItemDefinition.find().lean();
  }
}
