import { DEFAULT_GAME_CONFIG, type GameBalanceConfig } from "@bunnydex/config";
import { GameConfig } from "@bunnydex/database";

let cache: GameBalanceConfig | null = null;
let cacheAt = 0;
const TTL_MS = 30_000;

export class ConfigService {
  static async get(): Promise<GameBalanceConfig> {
    const now = Date.now();
    if (cache && now - cacheAt < TTL_MS) {
      return cache;
    }
    const doc = await GameConfig.findOne({ key: "default" }).lean();
    cache = {
      ...DEFAULT_GAME_CONFIG,
      ...((doc?.values as Partial<GameBalanceConfig> | undefined) ?? {}),
    };
    cacheAt = now;
    return cache;
  }

  static async patch(values: Partial<GameBalanceConfig>): Promise<GameBalanceConfig> {
    const current = await this.get();
    const next = { ...current, ...values };
    await GameConfig.findOneAndUpdate(
      { key: "default" },
      { key: "default", values: next },
      { upsert: true },
    );
    cache = next;
    cacheAt = Date.now();
    return next;
  }

  static clearCache() {
    cache = null;
    cacheAt = 0;
  }
}
