import { ShopOffer, User } from "@bunnydex/database";
import { randomUUID } from "node:crypto";
import { assertFound, DomainError } from "../errors.js";
import { EconomyService } from "./economy-service.js";
import { InventoryService } from "./inventory-service.js";
import { PackService } from "./pack-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";

export class ShopService {
  static async list(category?: string) {
    const q: Record<string, unknown> = { enabled: true };
    if (category) q.category = category;
    const now = new Date();
    const offers = await ShopOffer.find(q).lean();
    return offers.filter((o) => {
      if (o.startsAt && o.startsAt > now) return false;
      if (o.endsAt && o.endsAt < now) return false;
      return true;
    });
  }

  static async buy(discordId: string, sku: string, quantity = 1) {
    if (quantity < 1 || quantity > 20) {
      throw new DomainError("VALIDATION", "Invalid quantity.");
    }
    const user = await UserService.requireByDiscordId(discordId);
    const offer = assertFound(
      await ShopOffer.findOne({ sku, enabled: true }),
      "Shop offer not found.",
    );

    const unit = offer.price.amount;
    const discount = offer.discountBps ? 1 - offer.discountBps / 10_000 : 1;
    const total = Math.max(1, Math.floor(unit * discount * quantity));
    const currency = offer.price.currency as "coins" | "gems" | "tickets";
    const idem = `shop:${user._id}:${sku}:${randomUUID()}`;

    await EconomyService.debit({
      userId: String(user._id),
      currency,
      amount: total,
      type: "shop_purchase",
      idempotencyKey: idem,
      refType: "shop",
      refId: sku,
      meta: { quantity },
    });

    const grants = [];
    for (let i = 0; i < quantity; i++) {
      const kind = offer.itemRef.kind;
      if (kind === "pack" && offer.itemRef.refSlug) {
        const opened = await PackService.openForUser(
          String(user._id),
          offer.itemRef.refSlug,
          `${idem}:pack:${i}`,
        );
        grants.push({ kind: "pack", ...opened });
      } else if ((kind === "item" || kind === "box") && offer.itemRef.refSlug) {
        await InventoryService.grantItem({
          userId: String(user._id),
          itemSlug: offer.itemRef.refSlug,
          quantity: 1,
        });
        grants.push({ kind, itemSlug: offer.itemRef.refSlug });
      } else if (kind === "ticket") {
        await EconomyService.credit({
          userId: String(user._id),
          currency: "tickets",
          amount: offer.itemRef.amount ?? 1,
          type: "shop_ticket",
          idempotencyKey: `${idem}:ticket:${i}`,
        });
        grants.push({ kind: "ticket", amount: offer.itemRef.amount ?? 1 });
      }
    }

    if (typeof offer.stock === "number") {
      const updated = await ShopOffer.findOneAndUpdate(
        { _id: offer._id, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true },
      );
      if (!updated) {
        throw new DomainError("CONFLICT", "Offer out of stock.");
      }
    }

    await User.findByIdAndUpdate(user._id, { $inc: { "stats.shopPurchases": quantity } });
    await EventBus.emit("shop.purchased", { userId: String(user._id), sku, quantity });

    return { offer, total, currency, grants };
  }
}
