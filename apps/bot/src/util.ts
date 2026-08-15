import type { Message, User as DiscordUser } from "discord.js";
import { DomainError } from "@bunnydex/game";
import type { DiscordIdentity } from "@bunnydex/types";

export function identityFromDiscord(user: DiscordUser): DiscordIdentity {
  return {
    discordId: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarUrl: user.displayAvatarURL({ size: 128 }),
  };
}

export function formatError(err: unknown): string {
  if (err instanceof DomainError) {
    return `❌ ${err.message}`;
  }
  console.error(err);
  return "❌ Something went wrong. Try again later.";
}

export async function reply(message: Message, content: string) {
  if (content.length > 1900) {
    content = content.slice(0, 1900) + "…";
  }
  await message.reply(content);
}

export function mentionId(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^<@!?(\d+)>$/);
  return m?.[1] ?? (/^\d+$/.test(raw) ? raw : null);
}
