import { User } from "@bunnydex/database";
import type { LeaderboardKind } from "@bunnydex/types";

export class LeaderboardService {
  static async get(kind: LeaderboardKind, limit = 10) {
    const sortMap: Record<LeaderboardKind, Record<string, 1 | -1>> = {
      wealth: { coins: -1 },
      collection: { "stats.collectionUnique": -1 },
      rating: { battleRating: -1 },
      wins: { "stats.wins": -1 },
      achievements: { "stats.achievementScore": -1 },
      rare: { "stats.collectionUnique": -1 },
      value: { coins: -1 },
    };
    const sort = sortMap[kind] ?? { coins: -1 };
    const users = await User.find({ "flags.banned": { $ne: true } })
      .sort(sort)
      .limit(limit)
      .select("displayName username coins battleRating level stats")
      .lean();

    return users.map((u, i) => ({
      rank: i + 1,
      displayName: u.displayName,
      username: u.username,
      coins: u.coins,
      battleRating: u.battleRating,
      level: u.level,
      wins: u.stats?.wins ?? 0,
      collectionUnique: u.stats?.collectionUnique ?? 0,
      achievementScore: u.stats?.achievementScore ?? 0,
    }));
  }
}
