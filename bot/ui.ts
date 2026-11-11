import path from "node:path";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { getCard, type CardDef, type Rarity } from "../game/data/cards";
import { RARITY_EMOJI, variantInfo } from "../game/config";
import { cardStats } from "../game/rules";

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x9ca3af, uncommon: 0x22c55e, rare: 0x3b82f6, epic: 0xa855f7, legendary: 0xeab308, mythic: 0xef4444, secret: 0x111827,
};
// BunnyDex look (from the card back): gold for results and rewards, violet for system/neutral messages.
export const BRAND = 0xf0b12a; // gold
export const VIOLET = 0x8b5cf6;
export const GEM = "◆";

export const coins = (n: number) => `🪙 **${n.toLocaleString()}**`;
export const mention = (id: string) => `<@${id}>`;

/** One-line card summary: `k3x9qa` 🔵 Foil Tide Tuft · Lv 3 */
export function cardLine(c: { code: string; slug: string; variant: string; level: number; status?: string }) {
  const def = getCard(c.slug);
  const v = c.variant !== "normal" ? `${variantInfo(c.variant).name} ` : "";
  const status = c.status && c.status !== "available" ? ` · *${c.status}*` : "";
  return `\`${c.code}\` ${RARITY_EMOJI[def.rarity]} ${v}**${def.name}** · Lv ${c.level}${status}`;
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
  const e = new EmbedBuilder()
    .setColor(RARITY_COLOR[def.rarity])
    .setTitle(opts.title ?? `${RARITY_EMOJI[def.rarity]} ${v}${def.name}`)
    .setDescription(`*${def.description}*`)
    .addFields(
      { name: "Rarity", value: def.rarity, inline: true },
      { name: "Element", value: def.element, inline: true },
      { name: "Level", value: String(level), inline: true },
      { name: "Stats", value: `⚔️ ${s.atk} · 🛡️ ${s.def} · ❤️ ${s.hp}`, inline: true },
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

export const info = (text: string, color = BRAND) => new EmbedBuilder().setColor(color).setDescription(text);
