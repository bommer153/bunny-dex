import { Deck, UserCard } from "@bunnydex/database";
import { assertFound, DomainError } from "../errors.js";
import { ConfigService } from "./config-service.js";
import { UserService } from "./user-service.js";
import { CardService } from "./card-service.js";

export class DeckService {
  static async list(discordId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    return Deck.find({ userId: user._id }).lean();
  }

  static async create(discordId: string, name: string) {
    const user = await UserService.requireByDiscordId(discordId);
    try {
      const deck = await Deck.create({
        userId: user._id,
        name,
        slots: [],
        validation: { isValid: false, errors: ["Deck is empty"] },
      });
      return deck;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        throw new DomainError("CONFLICT", "A deck with that name already exists.");
      }
      throw err;
    }
  }

  static async remove(discordId: string, name: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const res = await Deck.findOneAndDelete({ userId: user._id, name });
    return assertFound(res, "Deck not found.");
  }

  static async view(discordId: string, name: string) {
    const user = await UserService.requireByDiscordId(discordId);
    return assertFound(
      await Deck.findOne({ userId: user._id, name }),
      "Deck not found.",
    );
  }

  static async setActive(discordId: string, name: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const deck = await this.view(discordId, name);
    const validation = await this.validateDeck(String(user._id), deck.slots);
    if (!validation.isValid) {
      throw new DomainError("VALIDATION", `Deck invalid: ${validation.errors.join(", ")}`);
    }
    await Deck.updateMany({ userId: user._id }, { $set: { isActive: false } });
    deck.isActive = true;
    deck.validation = validation;
    await deck.save();
    return deck;
  }

  static async addCard(discordId: string, deckName: string, userCardId: string) {
    const user = await UserService.requireByDiscordId(discordId);
    const deck = await this.view(discordId, deckName);
    const config = await ConfigService.get();
    if (deck.slots.length >= config.deckSize) {
      throw new DomainError("VALIDATION", `Deck is full (${config.deckSize} cards).`);
    }
    const card = await CardService.requireOwnedAvailable(String(user._id), userCardId);
    if (deck.slots.some((s) => String(s.userCardId) === userCardId)) {
      throw new DomainError("VALIDATION", "Card already in deck.");
    }
    const copies = deck.slots.filter(
      (s) => String(s.cardDefinitionId) === String(card.cardDefinitionId),
    ).length;
    if (copies >= config.maxCopiesPerDefinition) {
      throw new DomainError(
        "VALIDATION",
        `Max ${config.maxCopiesPerDefinition} copies of that card.`,
      );
    }
    deck.slots.push({
      userCardId: card._id,
      cardDefinitionId: card.cardDefinitionId,
    });
    deck.validation = await this.validateDeck(String(user._id), deck.slots);
    await deck.save();
    return deck;
  }

  static async removeCard(discordId: string, deckName: string, userCardId: string) {
    const deck = await this.view(discordId, deckName);
    const nextSlots = deck.slots.filter((s: { userCardId: unknown }) => String(s.userCardId) !== userCardId);
    deck.set("slots", nextSlots);
    const user = await UserService.requireByDiscordId(discordId);
    deck.validation = await this.validateDeck(String(user._id), nextSlots);
    await deck.save();
    return deck;
  }

  static async getActive(userId: string) {
    return Deck.findOne({ userId, isActive: true });
  }

  static async validateDeck(
    userId: string,
    slots: Array<{ userCardId: unknown; cardDefinitionId: unknown }>,
  ) {
    const config = await ConfigService.get();
    const errors: string[] = [];
    if (slots.length !== config.deckSize) {
      errors.push(`Need exactly ${config.deckSize} cards (have ${slots.length}).`);
    }
    const defCounts = new Map<string, number>();
    for (const slot of slots) {
      const owned = await UserCard.findOne({
        _id: slot.userCardId,
        userId,
        status: "available",
      });
      if (!owned) errors.push(`Card ${String(slot.userCardId)} unavailable.`);
      const key = String(slot.cardDefinitionId);
      defCounts.set(key, (defCounts.get(key) ?? 0) + 1);
    }
    for (const [, count] of defCounts) {
      if (count > config.maxCopiesPerDefinition) {
        errors.push(`Too many copies of a card (${count}).`);
      }
    }
    return { isValid: errors.length === 0, errors };
  }
}
