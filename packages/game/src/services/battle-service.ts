import { Battle, CardDefinition, User, UserCard } from "@bunnydex/database";
import { ELEMENT_ADVANTAGE } from "@bunnydex/config";
import { randomUUID } from "node:crypto";
import { DomainError, assertFound } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { DeckService } from "./deck-service.js";
import { EconomyService } from "./economy-service.js";
import { UserService } from "./user-service.js";
import { EventBus } from "../event-bus.js";
type Snap = {
  userCardId: string;
  cardDefinitionId: string;
  name: string;
  rarity: string;
  element: string;
  atk: number;
  def: number;
  hp: number;
  variant: string;
  level: number;
};

function laneScore(card: Snap, enemyElement: string): number {
  let score = card.atk * 1.2 + card.def + card.hp * 0.15 + card.level;
  if (ELEMENT_ADVANTAGE[card.element] === enemyElement) {
    score *= 1.25;
  }
  return score;
}

function pickThree(cards: Snap[], seed: string): Snap[] {
  const sorted = [...cards];
  // deterministic shuffle from seed
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = sorted.length - 1; i > 0; i--) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  }
  return sorted.slice(0, 3);
}

async function loadDeckSnaps(userId: string): Promise<Snap[]> {
  const deck = await DeckService.getActive(userId);
  if (!deck || !deck.validation?.isValid) {
    throw new DomainError("INVALID_STATE", "You need a valid active deck (12 cards).");
  }
  const snaps: Snap[] = [];
  for (const slot of deck.slots) {
    const uc = await UserCard.findById(slot.userCardId);
    const def = await CardDefinition.findById(slot.cardDefinitionId);
    if (!uc || !def || uc.status !== "available") {
      throw new DomainError("INVALID_STATE", "Active deck has unavailable cards.");
    }
    snaps.push({
      userCardId: String(uc._id),
      cardDefinitionId: String(def._id),
      name: def.name,
      rarity: def.rarity,
      element: def.element,
      atk: def.atk,
      def: def.def,
      hp: def.hp,
      variant: uc.variant,
      level: uc.level,
    });
  }
  return snaps;
}

export class BattleService {
  static async resolveMatch(input: {
    challengerId: string;
    opponentId: string;
    mode: "random" | "direct";
  }) {
    if (input.challengerId === input.opponentId) {
      throw new DomainError("VALIDATION", "Cannot battle yourself.");
    }
    const config = await ConfigService.get();
    const seed = randomUUID();
    const challengerCards = pickThree(await loadDeckSnaps(input.challengerId), seed + "a");
    const opponentCards = pickThree(await loadDeckSnaps(input.opponentId), seed + "b");

    const lanes = [];
    let cWins = 0;
    let oWins = 0;
    for (let i = 0; i < config.battleLaneCount; i++) {
      const c = challengerCards[i]!;
      const o = opponentCards[i]!;
      const cScore = laneScore(c, o.element);
      const oScore = laneScore(o, c.element);
      let winner: "challenger" | "opponent" | "draw" = "draw";
      if (cScore > oScore) {
        winner = "challenger";
        cWins++;
      } else if (oScore > cScore) {
        winner = "opponent";
        oWins++;
      }
      lanes.push({
        lane: i + 1,
        challengerCard: c,
        opponentCard: o,
        challengerScore: Math.round(cScore * 10) / 10,
        opponentScore: Math.round(oScore * 10) / 10,
        winner,
      });
    }

    const winnerId =
      cWins === oWins ? null : cWins > oWins ? input.challengerId : input.opponentId;

    const challenger = await UserService.requireById(input.challengerId);
    const opponent = await UserService.requireById(input.opponentId);
    const ratingDelta = { challenger: 0, opponent: 0 };
    if (winnerId === input.challengerId) {
      ratingDelta.challenger = 15;
      ratingDelta.opponent = -10;
    } else if (winnerId === input.opponentId) {
      ratingDelta.challenger = -10;
      ratingDelta.opponent = 15;
    }

    await User.findByIdAndUpdate(input.challengerId, {
      $inc: {
        battleRating: ratingDelta.challenger,
        ...(winnerId === input.challengerId
          ? { "stats.wins": 1 }
          : winnerId
            ? { "stats.losses": 1 }
            : {}),
      },
    });
    await User.findByIdAndUpdate(input.opponentId, {
      $inc: {
        battleRating: ratingDelta.opponent,
        ...(winnerId === input.opponentId
          ? { "stats.wins": 1 }
          : winnerId
            ? { "stats.losses": 1 }
            : {}),
      },
    });

    const rewards: Record<string, unknown> = {};
    for (const [uid, isWinner] of [
      [input.challengerId, winnerId === input.challengerId],
      [input.opponentId, winnerId === input.opponentId],
    ] as const) {
      const coins = isWinner ? config.battleWinCoins : config.battleLossCoins;
      const xp = isWinner ? config.battleWinXp : config.battleLossXp;
      await EconomyService.credit({
        userId: uid,
        currency: "coins",
        amount: coins,
        type: isWinner ? "battle_win" : "battle_loss",
        idempotencyKey: `battle-reward:${seed}:${uid}`,
        refType: "battle",
        refId: seed,
      });
      await UserService.addXp(uid, xp);
      rewards[uid] = { coins, xp, won: isWinner };
    }

    const battle = await Battle.create({
      challengerId: input.challengerId,
      opponentId: input.opponentId,
      mode: input.mode,
      status: "completed",
      seed,
      lanes,
      winnerId: winnerId ?? undefined,
      rewards,
      ratingDelta,
    });

    if (winnerId) {
      await EventBus.emit("battle.won", { userId: winnerId, battleId: String(battle._id) });
    }

    return {
      battle,
      challengerName: challenger.displayName,
      opponentName: opponent.displayName,
      winnerId,
      lanes,
      ratingDelta,
      rewards,
    };
  }

  static async challenge(discordId: string, opponentDiscordId: string) {
    const challenger = await UserService.requireByDiscordId(discordId);
    const opponent = await UserService.requireByDiscordId(opponentDiscordId);
    return this.resolveMatch({
      challengerId: String(challenger._id),
      opponentId: String(opponent._id),
      mode: "direct",
    });
  }

  static async history(discordId: string, limit = 10) {
    const user = await UserService.requireByDiscordId(discordId);
    return Battle.find({
      $or: [{ challengerId: user._id }, { opponentId: user._id }],
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
