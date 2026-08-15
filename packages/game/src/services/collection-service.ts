import {
  CollectionSet,
  UserCollectionProgress,
  UserCard,
  CardDefinition,
} from "@bunnydex/database";
import {
  CARD_TYPES,
  ELEMENTS,
  RARITIES,
  VARIANTS,
  type CardType,
  type Element,
  type Rarity,
  type Variant,
} from "@bunnydex/types";
import { DomainError } from "../errors.js";
import { UserService } from "./user-service.js";

export type CollectionFacet = "rarity" | "element" | "variant" | "type" | "set";

export type CollectionQuery =
  | { kind: "overview" }
  | { kind: "facet"; facet: CollectionFacet }
  | { kind: "detail"; facet: CollectionFacet; value: string };

export type CollectionCount = { key: string; owned: number; total: number; copies?: number };

type CatalogCard = {
  _id: unknown;
  name: string;
  slug: string;
  rarity: string;
  element: string;
  cardType?: string;
  setId: string;
};

const FACET_ALIASES: Record<string, CollectionFacet> = {
  rarity: "rarity",
  rarities: "rarity",
  element: "element",
  elements: "element",
  elem: "element",
  variant: "variant",
  variants: "variant",
  type: "type",
  types: "type",
  set: "set",
  sets: "set",
};

const USAGE = [
  "`bd collection` — sets, rarity, elements, variants, types",
  "`bd collection rarity [common|uncommon|rare|epic|legendary|mythic|secret]`",
  "`bd collection element [fire|water|nature|electric|ice|shadow|light]`",
  "`bd collection variant [normal|foil|golden|shadow|crystal|rainbow|celestial|royal]`",
  "`bd collection type [bunny|spell|artifact]`",
  "Shortcuts: `bd rarity legendary` · `bd element fire` · `bd variant foil` · `bd type bunny`",
].join("\n");

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idStr(value: unknown): string {
  return String(value);
}

function mergeCounts(keys: readonly string[], map: Record<string, CollectionCount>): CollectionCount[] {
  return keys.map((key) => map[key] ?? { key, owned: 0, total: 0 });
}

export class CollectionService {
  static usage() {
    return USAGE;
  }

  static async parseArgs(args: string[]): Promise<CollectionQuery> {
    if (!args.length) return { kind: "overview" };

    const head = args[0]!.toLowerCase();
    const rest = args.slice(1).join(" ").toLowerCase().trim();

    if (head === "help") {
      throw new DomainError("VALIDATION", USAGE);
    }

    const aliased = FACET_ALIASES[head];
    if (aliased) {
      if (!rest) return { kind: "facet", facet: aliased };
      return { kind: "detail", facet: aliased, value: await this.normalizeValue(aliased, rest) };
    }

    const hits: CollectionFacet[] = [];
    if (includes(RARITIES, head)) hits.push("rarity");
    if (includes(ELEMENTS, head)) hits.push("element");
    if (includes(VARIANTS, head)) hits.push("variant");
    if (includes(CARD_TYPES, head)) hits.push("type");
    const set = await CollectionSet.findOne({ setId: head }).lean();
    if (set) hits.push("set");

    if (hits.length === 1) {
      const facet = hits[0]!;
      return { kind: "detail", facet, value: await this.normalizeValue(facet, head) };
    }
    if (hits.length > 1) {
      const opts = hits.map((f) => `\`bd collection ${f} ${head}\``).join(" or ");
      throw new DomainError(
        "VALIDATION",
        `"${head}" is both ${hits.join(" and ")}. Use ${opts}.`,
      );
    }

    throw new DomainError("VALIDATION", `Unknown collection filter "${head}".\n${USAGE}`);
  }

  static async getProgress(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    let progress = await UserCollectionProgress.find({ userId: user._id }).lean();
    if (!progress.length) {
      const { CardService } = await import("./card-service.js");
      await CardService.refreshCollectionStats(String(user._id));
      progress = await UserCollectionProgress.find({ userId: user._id }).lean();
    }

    const [sets, catalog, ownedDefs, variantGroups, totalCards] = await Promise.all([
      CollectionSet.find().lean(),
      CardDefinition.find({}, { name: 1, slug: 1, rarity: 1, element: 1, cardType: 1, setId: 1 }).lean(),
      UserCard.distinct("cardDefinitionId", { userId: user._id, status: { $ne: "locked" } }),
      UserCard.aggregate<{ _id: string; copies: number; unique: unknown[] }>([
        { $match: { userId: user._id, status: { $ne: "locked" } } },
        {
          $group: {
            _id: "$variant",
            copies: { $sum: 1 },
            unique: { $addToSet: "$cardDefinitionId" },
          },
        },
      ]),
      UserCard.countDocuments({ userId: user._id }),
    ]);

    const ownedSet = new Set(ownedDefs.map(idStr));
    const unique = ownedSet.size;
    const catalogSize = catalog.length;

    const rarityMap: Record<string, CollectionCount> = {};
    const elementMap: Record<string, CollectionCount> = {};
    const typeMap: Record<string, CollectionCount> = {};
    for (const card of catalog as CatalogCard[]) {
      const owned = ownedSet.has(idStr(card._id));
      const bump = (map: Record<string, CollectionCount>, key: string) => {
        if (!map[key]) map[key] = { key, owned: 0, total: 0 };
        map[key]!.total += 1;
        if (owned) map[key]!.owned += 1;
      };
      bump(rarityMap, card.rarity);
      bump(elementMap, card.element);
      bump(typeMap, card.cardType || "bunny");
    }

    const variantMap: Record<string, CollectionCount> = {};
    for (const row of variantGroups) {
      variantMap[row._id] = {
        key: row._id,
        owned: row.unique.length,
        total: catalogSize,
        copies: row.copies,
      };
    }

    return {
      totalCards,
      unique,
      catalogSize,
      completionPct: catalogSize ? Math.round((unique / catalogSize) * 1000) / 10 : 0,
      sets: sets.map((s) => {
        const p = progress.find((x) => x.setId === s.setId);
        return {
          setId: s.setId,
          name: s.name,
          owned: p?.ownedUnique ?? 0,
          total: p?.total ?? s.cardDefinitionIds.length,
        };
      }),
      rarityProgress: Object.fromEntries(
        mergeCounts(RARITIES, rarityMap).map((r) => [r.key, { owned: r.owned, total: r.total }]),
      ) as Record<string, { owned: number; total: number }>,
      rarity: mergeCounts(RARITIES, rarityMap),
      elements: mergeCounts(ELEMENTS, elementMap),
      types: mergeCounts(CARD_TYPES, typeMap),
      variants: mergeCounts(VARIANTS, variantMap).map((row) => ({
        ...row,
        copies: variantMap[row.key]?.copies ?? 0,
        total: catalogSize,
      })),
    };
  }

  static facetRows(
    progress: Awaited<ReturnType<typeof CollectionService.getProgress>>,
    facet: CollectionFacet,
  ): CollectionCount[] {
    if (facet === "rarity") return progress.rarity;
    if (facet === "element") return progress.elements;
    if (facet === "variant") return progress.variants;
    if (facet === "type") return progress.types;
    return progress.sets.map((s) => ({
      key: s.setId,
      owned: s.owned,
      total: s.total,
    }));
  }

  static async inspect(discordId: string, facet: CollectionFacet, value: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const normalized = await this.normalizeValue(facet, value);
    const [catalog, copies] = await Promise.all([
      CardDefinition.find({}, { name: 1, slug: 1, rarity: 1, element: 1, cardType: 1, setId: 1 }).lean(),
      UserCard.find({ userId: user._id, status: { $ne: "locked" } })
        .populate("cardDefinitionId")
        .lean(),
    ]);

    const matchingCatalog = (catalog as CatalogCard[]).filter((card) => {
      if (facet === "rarity") return card.rarity === normalized;
      if (facet === "element") return card.element === normalized;
      if (facet === "type") return (card.cardType || "bunny") === normalized;
      if (facet === "set") return card.setId === normalized;
      return true;
    });

    const ownedByDef = new Map<string, { name: string; slug: string; variants: string[] }>();
    const ownedCopies: Array<{
      userCardId: string;
      name: string;
      slug: string;
      variant: string;
      rarity: string;
      element: string;
    }> = [];

    for (const copy of copies) {
      const def = copy.cardDefinitionId as CatalogCard | null;
      if (!def || typeof def !== "object" || !("slug" in def)) continue;
      const variant = String(copy.variant ?? "normal");
      const matches =
        facet === "variant"
          ? variant === normalized
          : facet === "rarity"
            ? def.rarity === normalized
            : facet === "element"
              ? def.element === normalized
              : facet === "type"
                ? (def.cardType || "bunny") === normalized
                : def.setId === normalized;
      if (!matches) continue;

      ownedCopies.push({
        userCardId: idStr(copy._id),
        name: def.name,
        slug: def.slug,
        variant,
        rarity: def.rarity,
        element: def.element,
      });
      const prev = ownedByDef.get(idStr(def._id));
      if (prev) {
        if (!prev.variants.includes(variant)) prev.variants.push(variant);
      } else {
        ownedByDef.set(idStr(def._id), {
          name: def.name,
          slug: def.slug,
          variants: [variant],
        });
      }
    }

    const missing = matchingCatalog
      .filter((card) => !ownedByDef.has(idStr(card._id)))
      .map((card) => ({
        name: card.name,
        slug: card.slug,
        rarity: card.rarity,
        element: card.element,
      }));

    const previewSlug = ownedCopies[0]?.slug ?? missing[0]?.slug ?? matchingCatalog[0]?.slug;

    return {
      facet,
      value: normalized,
      ownedUnique: ownedByDef.size,
      total: facet === "variant" ? catalog.length : matchingCatalog.length,
      copies: ownedCopies.length,
      owned: [...ownedByDef.values()],
      ownedCopies,
      missing,
      previewSlug,
    };
  }

  static async missing(discordId: string, setId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const set = await CollectionSet.findOne({ setId }).lean();
    if (!set) return [];
    const owned = new Set(
      (await UserCard.distinct("cardDefinitionId", { userId: user._id })).map(String),
    );
    const missingIds = set.cardDefinitionIds.filter((id) => !owned.has(String(id)));
    return CardDefinition.find({ _id: { $in: missingIds } }).lean();
  }

  private static async normalizeValue(facet: CollectionFacet, raw: string) {
    const value = raw.toLowerCase().replace(/\s+/g, "-");
    if (facet === "rarity") {
      if (!includes(RARITIES, value)) {
        throw new DomainError("VALIDATION", `Unknown rarity "${raw}". Try: ${RARITIES.join(", ")}`);
      }
      return value as Rarity;
    }
    if (facet === "element") {
      if (!includes(ELEMENTS, value)) {
        throw new DomainError("VALIDATION", `Unknown element "${raw}". Try: ${ELEMENTS.join(", ")}`);
      }
      return value as Element;
    }
    if (facet === "variant") {
      if (!includes(VARIANTS, value)) {
        throw new DomainError("VALIDATION", `Unknown variant "${raw}". Try: ${VARIANTS.join(", ")}`);
      }
      return value as Variant;
    }
    if (facet === "type") {
      if (!includes(CARD_TYPES, value)) {
        throw new DomainError("VALIDATION", `Unknown type "${raw}". Try: ${CARD_TYPES.join(", ")}`);
      }
      return value as CardType;
    }
    const set = await CollectionSet.findOne({
      $or: [{ setId: value }, { name: new RegExp(`^${escapeRegex(raw)}$`, "i") }],
    }).lean();
    if (!set) {
      throw new DomainError("VALIDATION", `Unknown set "${raw}". Use \`bd collection set\`.`);
    }
    return set.setId;
  }
}
