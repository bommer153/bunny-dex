import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  EmbedBuilder,
  type Message,
  type User as DiscordUser,
} from "discord.js";
import { DomainError } from "@bunnydex/game";
import type { DiscordIdentity } from "@bunnydex/types";

const MEADOW = 0x6fcf97;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export function publicWebUrl(): string {
  const candidates = [
    process.env.PUBLIC_WEB_URL,
    process.env.NEXTAUTH_URL,
    "https://bunny-card-dex-lilac.vercel.app",
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const url = raw.replace(/\/$/, "");
    if (url.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(url)) {
      return url;
    }
  }
  return "https://bunny-card-dex-lilac.vercel.app";
}

export function cardArtLocalPath(slug: string): string {
  const filename = `${slug}.png`;
  const candidates = [
    path.resolve(__dirname, "../../web/public/cards", filename),
    path.resolve(process.cwd(), "../web/public/cards", filename),
    path.resolve(process.cwd(), "apps/web/public/cards", filename),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]!;
}

export function cardArtPublicUrl(slug: string): string {
  return `${publicWebUrl()}/cards/${encodeURIComponent(slug)}.png`;
}

export function wikiUrl(page = ""): string {
  const suffix = page ? `/wiki/${page}` : "/wiki";
  return `${publicWebUrl()}${suffix}`;
}

function attachCardArt(slug: string | undefined, embed: EmbedBuilder) {
  if (!slug) return undefined;
  const local = cardArtLocalPath(slug);
  if (fs.existsSync(local)) {
    const filename = `${slug}.png`;
    embed.setImage(`attachment://${filename}`);
    return new AttachmentBuilder(local, { name: filename });
  }
  embed.setImage(cardArtPublicUrl(slug));
  return undefined;
}

export async function replyEmbed(
  message: Message,
  opts: {
    title: string;
    description?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    slug?: string;
    footer?: string;
  },
) {
  const embed = new EmbedBuilder()
    .setColor(MEADOW)
    .setTitle(opts.title)
    .setTimestamp();
  if (opts.description) embed.setDescription(opts.description);
  if (opts.fields?.length) embed.addFields(opts.fields);
  if (opts.footer) embed.setFooter({ text: opts.footer });
  const file = attachCardArt(opts.slug, embed);
  await message.reply({
    embeds: [embed],
    files: file ? [file] : [],
  });
}

export async function replyCardGallery(
  message: Message,
  title: string,
  cards: Array<{ name: string; rarity: string; variant: string; slug?: string }>,
) {
  const files: AttachmentBuilder[] = [];
  const embeds = cards.slice(0, 10).map((card, i) => {
    const embed = new EmbedBuilder()
      .setColor(MEADOW)
      .setTitle(i === 0 ? title : card.name)
      .setDescription(
        i === 0
          ? cards
              .map((c) => `• **${c.name}** (${c.rarity} · ${c.variant})`)
              .join("\n")
          : `${card.rarity} · ${card.variant}`,
      );
    if (card.slug) {
      const local = cardArtLocalPath(card.slug);
      if (fs.existsSync(local) && files.length < 10) {
        const filename = `${card.slug}-${i}.png`;
        files.push(new AttachmentBuilder(local, { name: filename }));
        embed.setThumbnail(`attachment://${filename}`);
        if (i === 0) embed.setImage(`attachment://${filename}`);
      } else {
        embed.setThumbnail(cardArtPublicUrl(card.slug));
        if (i === 0) embed.setImage(cardArtPublicUrl(card.slug));
      }
    }
    return embed;
  });

  await message.reply({
    embeds: embeds.slice(0, 10),
    files,
  });
}
