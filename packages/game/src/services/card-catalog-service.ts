import { CardDefinition, CardVariant } from "@bunnydex/database";
import type { Element, Rarity } from "@bunnydex/types";
import { assertFound, DomainError } from "../errors.js";

export class CardCatalogService {
  static async list(filters?: {
    rarity?: Rarity;
    element?: Element;
    setId?: string;
    q?: string;
    limit?: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filters?.rarity) query.rarity = filters.rarity;
    if (filters?.element) query.element = filters.element;
    if (filters?.setId) query.setId = filters.setId;
    if (filters?.q) query.$text = { $search: filters.q };

    return CardDefinition.find(query)
      .sort(filters?.q ? { score: { $meta: "textScore" } } : { rarity: 1, name: 1 })
      .limit(filters?.limit ?? 50)
      .lean();
  }

  static async getBySlugOrId(idOrSlug: string) {
    const bySlug = await CardDefinition.findOne({
      slug: idOrSlug.toLowerCase().replace(/\s+/g, "-"),
    }).lean();
    if (bySlug) return bySlug;

    const byName = await CardDefinition.findOne({
      name: new RegExp(`^${escapeRegex(idOrSlug)}$`, "i"),
    }).lean();
    if (byName) return byName;

    if (/^[a-f\d]{24}$/i.test(idOrSlug)) {
      return assertFound(await CardDefinition.findById(idOrSlug).lean(), "Card not found.");
    }

    throw new DomainError("NOT_FOUND", `Card "${idOrSlug}" not found.`);
  }

  static async getById(id: string) {
    return assertFound(await CardDefinition.findById(id).lean(), "Card not found.");
  }

  static async create(data: Record<string, unknown>) {
    return CardDefinition.create(data);
  }

  static async update(id: string, data: Record<string, unknown>) {
    return assertFound(
      await CardDefinition.findByIdAndUpdate(id, data, { new: true }),
      "Card not found.",
    );
  }

  static async listVariants() {
    return CardVariant.find().lean();
  }

  static async pickRandomCard(opts: {
    rarity?: Rarity;
    rarityMin?: Rarity;
    setId?: string;
    element?: Element;
    setIds?: string[];
  }) {
    const query: Record<string, unknown> = {};
    if (opts.rarity) query.rarity = opts.rarity;
    if (opts.setId) query.setId = opts.setId;
    if (opts.setIds?.length) query.setId = { $in: opts.setIds };
    if (opts.element) query.element = opts.element;
    if (opts.rarityMin) {
      const order = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "secret"];
      const idx = order.indexOf(opts.rarityMin);
      query.rarity = { $in: order.slice(idx) };
    }

    const count = await CardDefinition.countDocuments(query);
    if (count === 0) {
      const fallback = await CardDefinition.findOne().lean();
      return assertFound(fallback, "No cards in catalog.");
    }
    const skip = Math.floor(Math.random() * count);
    const card = await CardDefinition.findOne(query).skip(skip).lean();
    return assertFound(card, "Card roll failed.");
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
