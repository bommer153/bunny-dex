import {
  CollectionSet,
  UserCollectionProgress,
  UserCard,
  CardDefinition,
} from "@bunnydex/database";
import { UserService } from "./user-service.js";
import { RARITIES } from "@bunnydex/types";

export class CollectionService {
  static async getProgress(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    let progress = await UserCollectionProgress.find({ userId: user._id }).lean();
    if (!progress.length) {
      const { CardService } = await import("./card-service.js");
      await CardService.refreshCollectionStats(String(user._id));
      progress = await UserCollectionProgress.find({ userId: user._id }).lean();
    }
    const sets = await CollectionSet.find().lean();
    const totalCards = await UserCard.countDocuments({ userId: user._id });
    const unique = user.stats?.collectionUnique ?? 0;
    const catalogSize = await CardDefinition.countDocuments();

    const rarityProgress: Record<string, { owned: number; total: number }> = {};
    for (const rarity of RARITIES) {
      const total = await CardDefinition.countDocuments({ rarity });
      const ownedDefs = await UserCard.distinct("cardDefinitionId", { userId: user._id });
      const owned = await CardDefinition.countDocuments({
        rarity,
        _id: { $in: ownedDefs },
      });
      rarityProgress[rarity] = { owned, total };
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
      rarityProgress,
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
}
