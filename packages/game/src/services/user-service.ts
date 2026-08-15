import { DEFAULT_GAME_CONFIG } from "@bunnydex/config";
import { User } from "@bunnydex/database";
import type { DiscordIdentity } from "@bunnydex/types";
import { DomainError, assertFound } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { EconomyService } from "./economy-service.js";
import { CardService } from "./card-service.js";
import { CardDefinition } from "@bunnydex/database";

function xpForLevel(level: number, base: number, growth: number): number {
  return Math.floor(base * Math.pow(growth, level - 1));
}

export class UserService {
  static async getByDiscordId(discordId: string) {
    return User.findOne({ discordId });
  }

  static async getById(userId: string) {
    return User.findById(userId);
  }

  static async requireByDiscordId(discordId: string) {
    return assertFound(
      await this.getByDiscordId(discordId),
      "Player not found. Use `bd start` first.",
    );
  }

  static async requireById(userId: string) {
    return assertFound(await this.getById(userId), "User not found.");
  }

  static async getOrCreateFromDiscord(identity: DiscordIdentity) {
    const existing = await this.getByDiscordId(identity.discordId);
    if (existing) {
      existing.username = identity.username;
      existing.displayName = identity.displayName;
      if (identity.avatarUrl) existing.avatarUrl = identity.avatarUrl;
      await existing.save();
      return { user: existing, created: false };
    }

    const config = await ConfigService.get();
    const user = await User.create({
      discordId: identity.discordId,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      coins: 0,
      gems: 0,
      tickets: 0,
      battleRating: config.startingBattleRating ?? DEFAULT_GAME_CONFIG.startingBattleRating,
      startedAt: new Date(),
    });

    await EconomyService.credit({
      userId: String(user._id),
      currency: "coins",
      amount: config.starterCoins,
      type: "starter",
      idempotencyKey: `starter-coins:${user._id}`,
      refType: "starter",
      refId: String(user._id),
    });

    const starters = await CardDefinition.find({ "flags.isStarter": true }).limit(4);
    for (const card of starters) {
      await CardService.grantCard({
        userId: String(user._id),
        cardDefinitionId: String(card._id),
        variant: "normal",
        acquiredFrom: "starter",
      });
    }

    return { user: await User.findById(user._id), created: true };
  }

  static async start(identity: DiscordIdentity) {
    const result = await this.getOrCreateFromDiscord(identity);
    if (!result.created && result.user?.startedAt) {
      return { ...result, message: "Welcome back to BunnyDex!" };
    }
    return { ...result, message: "Welcome to BunnyDex! Discover. Collect. Battle." };
  }

  static async getProfile(discordId: string) {
    const user = await this.requireByDiscordId(discordId);
    if (user.flags?.banned) {
      throw new DomainError("FORBIDDEN", "This account is banned.");
    }
    return user;
  }

  static async addXp(userId: string, amount: number) {
    const config = await ConfigService.get();
    const user = await this.requireById(userId);
    user.xp += amount;
    let leveled = false;
    while (
      user.xp >=
      xpForLevel(user.level, config.xpPerLevelBase, config.xpPerLevelGrowth)
    ) {
      user.xp -= xpForLevel(user.level, config.xpPerLevelBase, config.xpPerLevelGrowth);
      user.level += 1;
      leveled = true;
    }
    await user.save();
    return { user, leveled };
  }

  static async setFavorite(discordId: string, userCardId: string) {
    const user = await this.requireByDiscordId(discordId);
    user.favoriteUserCardId = userCardId as unknown as typeof user.favoriteUserCardId;
    await user.save();
    return user;
  }
}
