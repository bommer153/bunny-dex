import { MatchmakingQueue } from "@bunnydex/database";
import { ConfigService } from "./config-service.js";
import { BattleService } from "./battle-service.js";
import { UserService } from "./user-service.js";

export class MatchmakingService {
  static async enqueueRandom(discordId: string, ctx?: { guildId?: string; channelId?: string }) {
    const user = await UserService.requireByDiscordId(discordId);
    const config = await ConfigService.get();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.matchmakingQueueTtlSeconds * 1000);

    await MatchmakingQueue.deleteMany({ expiresAt: { $lte: now } });

    const band = config.matchmakingRatingBand;
    const opponent = await MatchmakingQueue.findOne({
      userId: { $ne: user._id },
      rating: {
        $gte: user.battleRating - band,
        $lte: user.battleRating + band,
      },
      expiresAt: { $gt: now },
    }).sort({ enqueuedAt: 1 });

    if (opponent) {
      await MatchmakingQueue.deleteOne({ _id: opponent._id });
      await MatchmakingQueue.deleteOne({ userId: user._id });
      return BattleService.resolveMatch({
        challengerId: String(user._id),
        opponentId: String(opponent.userId),
        mode: "random",
      });
    }

    // anti-farm: avoid immediate rematch is handled by queue FIFO + rating band
    await MatchmakingQueue.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        rating: user.battleRating,
        guildId: ctx?.guildId,
        channelId: ctx?.channelId,
        enqueuedAt: now,
        expiresAt,
      },
      { upsert: true, new: true },
    );

    return {
      queued: true as const,
      message: "Searching for an opponent… Use `bd battle random` again shortly, or wait to be matched.",
      expiresAt,
    };
  }

  static async cancel(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    await MatchmakingQueue.deleteOne({ userId: user._id });
    return { cancelled: true };
  }
}
