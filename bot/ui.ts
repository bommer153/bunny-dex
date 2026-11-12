import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GuildMember,
  type MessageActionRowComponentBuilder, type User,
} from "discord.js";

/** The player whose message or click is being handled, so every embed can show their name and picture. */
const viewer = new AsyncLocalStorage<{ name: string; iconURL: string }>();
/** Runs `fn` with this player as the embed author (server nickname and avatar when available). */
export function asPlayer<T>(user: User, member: unknown, fn: () => Promise<T>) {
  const who = member instanceof GuildMember
    ? { name: member.displayName, iconURL: member.displayAvatarURL() }
    : { name: user.displayName, iconURL: user.displayAvatarURL() };
  return viewer.run(who, fn);
}
/**
 * Mascot emojis named `bunnydex_<mood>`: app emojis (Developer Portal → Emojis, work in every server) or emojis
 * from any server the bot is in. Text only: Discord shows custom emojis in descriptions/content, not titles or footers.
 */
const moods = new Map<string, string>();
export function loadMoods(list: Iterable<{ id: string; name: string | null; animated?: boolean | null }>) {
  for (const e of list) if (e.name?.startsWith("bunnydex_")) moods.set(e.name.slice(9), `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`);
}
export const mood = (name: string, fallback: string) => moods.get(name) ?? fallback;

/** A new embed headed with the current player's name and avatar (none for background posts like auction results). */
export function embed() {
  const e = new EmbedBuilder();
  const who = viewer.getStore();
  return who ? e.setAuthor(who) : e;
}
import { getCard, type CardDef, type Rarity } from "../game/data/cards";
import { RARITY_EMOJI, TRAITS, variantInfo } from "../game/config";
import { cardStats } from "../game/rules";

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x9ca3af, uncommon: 0x22c55e, rare: 0x3b82f6, epic: 0xa855f7, legendary: 0xeab308, mythic: 0xef4444, secret: 0xe879f9, // same hues as the web (RARITY_TEXT / RARITY_RGB)
};
// BunnyDex look (from the card back): gold for results and rewards, violet for system/neutral messages.
export const BRAND = 0xf0b12a; // gold
export const VIOLET = 0x8b5cf6;
export const RED = 0xdc2626; // errors

/** Emoji progress bar: `▰▰▰▱▱▱▱▱▱▱`. */
export const bar = (n: number, max: number, len = 10) => "▰".repeat(Math.round((Math.max(0, Math.min(n, max)) / Math.max(1, max)) * len)).padEnd(len, "▱");
export const GEM = "◆";

export const coins = (n: number) => `🪙 **${n.toLocaleString()}**`;
export const mention = (id: string) => `<@${id}>`;

/** One-line card summary: `k3x9qa` 🔵 Foil Tide Tuft · Lv 3 */
export function cardLine(c: { code: string; slug: string; variant: string; level: number; status?: string; locked?: boolean | null }) {
  const def = getCard(c.slug);
  const v = c.variant !== "normal" ? `${variantInfo(c.variant).name} ` : "";
  const status = c.status && c.status !== "available" ? ` · *${c.status}*` : "";
  return `\`${c.code}\` ${RARITY_EMOJI[def.rarity]} ${v}**${def.name}** · Lv ${c.level}${status}${c.locked ? " 🔒" : ""}`;
}

/** Card art is attached from public/cards, so it works without the website being online. */
/** Mascot thumbnail (public/brand/mascot.png, 16 KB). Use with .setThumbnail(MASCOT_URL). */
export const MASCOT_URL = "attachment://mascot.png";
export const mascotFile = () => new AttachmentBuilder(path.join(process.cwd(), "public", "brand", "mascot.png"), { name: "mascot.png" });

export const cardFile = (slug: string) => new AttachmentBuilder(path.join(process.cwd(), "public", "cards", `${slug}.png`), { name: `${slug}.png` });

export function cardEmbed(def: CardDef, opts: { variant?: string; level?: number; title?: string; image?: "thumb" | "full" } = {}) {
  const level = opts.level ?? 1;
  const s = cardStats(def, level);
  const v = opts.variant && opts.variant !== "normal" ? `${variantInfo(opts.variant).name} ` : "";
  const e = embed()
    .setColor(RARITY_COLOR[def.rarity])
    .setTitle(opts.title ?? `${RARITY_EMOJI[def.rarity]} ${v}${def.name}`)
    .setDescription(`*${def.description}*`)
    .addFields(
      { name: "Rarity", value: def.rarity, inline: true },
      { name: "Element", value: def.element, inline: true },
      { name: "Level", value: String(level), inline: true },
      { name: "Stats", value: `⚔️ ${s.atk} · 🛡️ ${s.def} · ❤️ ${s.hp}`, inline: true },
      { name: "Trait", value: `${TRAITS[def.element].name}: ${TRAITS[def.element].desc}`, inline: true },
    );
  if (def.abilities?.length) e.addFields({ name: "Ability", value: def.abilities.map((a) => `**${a.name}**: ${a.description}`).join("\n") });
  if (opts.image === "full") e.setImage(`attachment://${def.slug}.png`);
  else e.setThumbnail(`attachment://${def.slug}.png`);
  return e;
}

/** customId = action|arg|ownerId. ownerId "*" means anyone may press it. */
export const cid = (action: string, arg: string, ownerId: string) => `${action}|${arg}|${ownerId}`;

export function btn(id: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}

export const row = (...c: MessageActionRowComponentBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...c);

export const info = (text: string, color = BRAND) => embed().setColor(color).setDescription(text);
