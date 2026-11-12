import { ButtonStyle, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder, UserSelectMenuBuilder, type Message, type MessageCreateOptions } from "discord.js";
import { CARDS, RARITIES, findCard, getCard, type Rarity } from "../game/data/cards";
// shortcut: no per-command rate limit beyond game cooldowns; add one if spam becomes a problem.
import { COMBINE_CHANCE, COMBINE_COUNT, CONFIG, ITEMS, RARITY_EMOJI, REROLL_COST, SHARD_YIELD, TRAITS, itemInfo, variantInfo } from "../game/config";
import { NEWS } from "../game/news";
import { fail } from "../game/errors";
import { GUIDE, findGuide } from "../game/guide";
import { Guild, User, UserCard, type TradeDoc } from "../game/models";
import { collectionGrid } from "./grid";
import { auctionSlots, autoPick, burrowSlots, cardValue, completedSets, towerReward, towerTeam, energyWaitMs, formatDuration, isRarePlus, nextMinBid, nextRarity, parseDuration, setTitle, streakCoins } from "../game/rules";
import * as quests from "../game/services/quests";
import * as player from "../game/services/player";
import * as cards from "../game/services/cards";
import * as market from "../game/services/market";
import * as trade from "../game/services/trade";
import * as battle from "../game/services/battle";
import { fx } from "./fx";
import { BRAND, GEM, MASCOT_URL, RARITY_COLOR, VIOLET, bar, btn, mascotFile, cardEmbed, cardFile, cardLine, cid, coins, embed, info, mention, mood, row } from "./ui";

/** `frames` are shown first, one after another, by editing the message (a simple Discord "animation"). */
/** `frames` play first (message edits). `ms` = how long this frame stays up (default 900ms). */
export type Reply = Pick<MessageCreateOptions, "content" | "embeds" | "components" | "files"> & { frames?: Reply[]; ms?: number };
export type Ctx = { uid: string; name: string; channelId: string; args: string[]; guildId?: string | null; canManage?: boolean };
type Handler = (ctx: Ctx) => Promise<Reply | string>;

const P = CONFIG.prefix;
const PUBLIC_URL = process.env.PUBLIC_WEB_URL ?? process.env.NEXTAUTH_URL ?? "";

export const mentionId = (s?: string) => s?.match(/^<@!?(\d{15,20})>$|^(\d{15,20})$/)?.slice(1).find(Boolean);
const int = (s: string | undefined, what: string) => {
  const n = Number(s?.replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : fail("INVALID", `${what} must be a positive whole number.`);
};
const need = (s: string | undefined, usage: string) => s ?? fail("INVALID", `Usage: \`${P} ${usage}\``);

// ================= Shared renderers (also used by button handlers) =================

type CardRow = { code: string; slug: string; variant: string; level: number };
/** Select-menu options for cards (Discord allows 25). */
export const cardOptions = (list: CardRow[]) =>
  list.slice(0, 25).map((c) => {
    const d = getCard(c.slug);
    return { label: `${d.name} Lv${c.level}${c.variant !== "normal" ? ` · ${c.variant}` : ""}`.slice(0, 100), description: `${d.rarity} · ${c.code}`, value: c.code, emoji: RARITY_EMOJI[d.rarity] };
  });

const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
/** Filter for cards that may be used up (fed, combined, traded): skips 🔒 locked ones. */
export const UNLOCKED = { locked: { $ne: true } };
/** The player's available cards, best first. */
export async function availableCards(uid: string, filter: object = {}) {
  const list = await UserCard.find({ ownerId: uid, status: "available", ...filter }).lean();
  return list.sort((a, b) => RANK[getCard(b.slug).rarity] - RANK[getCard(a.slug).rarity] || b.level - a.level);
}

export function cardSelect(id: string, placeholder: string, list: CardRow[], min = 1, max = 1) {
  return new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(min).setMaxValues(Math.min(max, list.length, 25)).addOptions(cardOptions(list));
}

/** Everything you can do with one card, as buttons. */
export async function renderCardPanel(uid: string, code: string, note?: string): Promise<Reply> {
  const c = await cards.getOwnedCard(uid, code);
  const def = getCard(c.slug);
  const e = cardEmbed(def, { variant: c.variant, level: c.level }).setFooter({ text: `${c.locked ? "🔒 locked · " : ""}${c.code} · ${c.status} · value ~${cardValue(def, c.variant, c.level)} · XP ${c.xp}/${50 * c.level}` });
  const a = (act: string, label: string, style = ButtonStyle.Secondary) => btn(cid("cp", `${act}:${c.code}`, uid), label, style);
  const lock = c.locked ? a("unlock", "🔓 Unlock") : a("lock", "🔒 Lock");
  const components =
    c.status === "available"
      ? c.locked
        ? [row(a("burrow", "🕳️ Burrow"), a("carrot", "🥕 Feed carrot"), a("feedsel", "🍽️ Feed cards"), lock)]
        : [
            row(a("burrow", "🕳️ Burrow"), a("carrot", "🥕 Feed carrot"), a("feedsel", "🍽️ Feed cards"), a("combine", "🧪 Combine"), lock),
            row(a("market", "🏷️ Sell on market"), a("auction", "🔨 Auction"), a("sell", "💰 Sell to shop", ButtonStyle.Danger)),
          ]
      : c.status === "burrow"
        ? [row(a("carrot", "🥕 Feed carrot"), a("unburrow", "🐇 Take out of burrow"), lock)]
        : [row(lock)];
  return { content: note, embeds: [e], files: [cardFile(def.slug)], components };
}

function renderCardPanelLite(def: ReturnType<typeof getCard>, code: string): Reply {
  return { embeds: [cardEmbed(def, { image: "full" }).setFooter({ text: code })], files: [cardFile(def.slug)] };
}

export async function renderMenu(uid: string, name: string): Promise<Reply> {
  const [en, u, b, ready] = await Promise.all([player.getEnergy(uid), player.getUser(uid), cards.burrowStatus(uid), readyQuests(uid)]);
  const m = (cmd: string, label: string, style = ButtonStyle.Secondary) => btn(cid("menu", cmd, uid), label, style);
  // "Today" strip: what's waiting, most valuable first. The first one becomes the big "Do this next" button.
  const todo = ([
    (!u.lastDaily || Date.now() - u.lastDaily.getTime() >= CONFIG.dailyCooldownMs) && ["daily", "📅 Claim daily", "📅 Your daily reward is ready"],
    ready > 0 && ["quests claim", "🎁 Claim quests", `📜 ${ready} quest reward${ready > 1 ? "s" : ""} ready to claim`],
    b.pending > 0 && ["burrow collect", "🕳️ Collect burrow", `🕳️ Your burrow has ${coins(b.pending)} waiting`],
    en.energy >= en.max && ["hunt", "🌿 Hunt", "⚡ Energy is full, go use it"],
    b.cards.length < b.slots && ["burrow", "🕳️ Fill burrow", `🕳️ ${b.slots - b.cards.length} empty burrow slot${b.slots - b.cards.length > 1 ? "s" : ""}`],
  ].filter(Boolean) as [string, string, string][]);
  const next = todo[0] ?? (en.energy >= CONFIG.energyCost.hunt ? ["hunt", "🌿 Hunt", ""] : ["tower", "🏰 Tower", ""]);
  const today = todo.length ? todo.map((t) => t[2]).join("\n") : "✨ All caught up!";
  return {
    embeds: [
      info(`${GEM} **${name}'s BunnyDex**\n${coins(u.coins)} · Level ${u.level} · ⚡ ${bar(en.energy, en.max, 8)} ${energyText({ ...en })}\n\n**Today**\n${today}`)
        .setThumbnail(MASCOT_URL),
    ],
    files: [mascotFile()],
    components: [
      row(m("hunt", "🌿 Hunt"), m("work", "💼 Work"), m("daily", "📅 Daily"), m("battle", "⚔️ Battle"), m("profile", "👤 Profile")),
      row(m("col", "📚 Collection"), m("burrow", "🕳️ Burrow"), m("combine", "🧪 Combine"), m("deck", "🛡️ Deck"), m("dex", "📖 Dex")),
      row(m("shop", "🛒 Shop"), m("inv", "🎒 Inventory"), m("market", "🏪 Market"), m("auction", "🔨 Auctions"), m("lb", "🏆 Top")),
      row(m("quests", "📜 Quests"), m("tower", "🏰 Tower"), m("shard", "💠 Shards"), m("news", "📰 News"), m("help", "❓ Help")),
      // Own action ("next"): the same command already has a button above, and Discord rejects duplicate custom_ids (error 50035).
      row(btn(cid("next", next[0], uid), `▶️ Do this next: ${next[1]}`, ButtonStyle.Success)),
    ],
  };
}

export async function renderCollection(uid: string, page = 1, rarity?: Rarity): Promise<Reply> {
  const res = await cards.listCards(uid, { page, rarity });
  const prog = await cards.collectionProgress(uid);
  const e = embed()
    .setColor(BRAND)
    .setTitle(`📚 Collection${rarity ? ` · ${rarity}` : ""}`)
    .setDescription(res.cards.length ? res.cards.map(cardLine).join("\n") : "No cards here yet. Try `bd hunt`!")
    .setFooter({ text: `Page ${res.page}/${res.pages} · ${res.total} cards · Dex ${prog.owned}/${prog.total}` });
  const grid = await collectionGrid(res.cards);
  if (grid) e.setImage("attachment://collection.png");
  const menu = new StringSelectMenuBuilder()
    .setCustomId(cid("colr", "", uid))
    .setPlaceholder("Filter by rarity")
    .addOptions([{ label: "All rarities", value: "all" }, ...RARITIES.map((r) => ({ label: r, value: r, emoji: RARITY_EMOJI[r], default: r === rarity }))]);
  const r = rarity ?? "all";
  return {
    embeds: [e],
    files: grid ? [grid] : [],
    components: [
      row(
        btn(cid("col", `${res.page - 1}:${r}`, uid), "◀", ButtonStyle.Secondary, res.page <= 1),
        btn(cid("col", `${res.page + 1}:${r}`, uid), "▶", ButtonStyle.Secondary, res.page >= res.pages),
      ),
      row(menu),
      ...(res.cards.length ? [row(cardSelect(cid("pick", "", uid), "🔎 Open a card (feed, burrow, sell, combine…)", res.cards))] : []),
    ],
  };
}

export async function renderBurrow(uid: string): Promise<Reply> {
  const [b, free] = await Promise.all([cards.burrowStatus(uid), availableCards(uid)]);
  const lines = b.cards.map((c) => `${cardLine(c)} · +${c.pending}`);
  const e = info(
    `🕳️ **Bunny Burrow** (${b.cards.length}/${b.slots} slots)\n\n${lines.join("\n") || "Empty. Add a bunny: `bd burrow add <code>`"}\n\nReady to collect: ${coins(b.pending)}\n*Bunnies earn while you're away, up to ${CONFIG.burrowMaxHours}h. Higher rarity and level earn more.*`,
  );
  const tunnel = fx("burrow");
  if (tunnel) e.setThumbnail(tunnel.url);
  return {
    embeds: [e],
    files: tunnel ? [tunnel.file] : [],
    components: [
      row(btn(cid("burrow", "collect", uid), "Collect", ButtonStyle.Success, b.pending === 0), btn(cid("burrow", "refresh", uid), "Refresh")),
      ...(b.cards.length < b.slots && free.length ? [row(cardSelect(cid("bsel", "add", uid), "➕ Move a bunny in", free))] : []),
      ...(b.cards.length ? [row(cardSelect(cid("bsel", "remove", uid), "➖ Take a bunny out", b.cards))] : []),
    ],
  };
}

export async function renderTrade(t: TradeDoc): Promise<Reply> {
  const names = await market.usernames([t.fromId, t.toId]);
  const side = async (id: string, o: { cards: string[]; coins: number; confirmed: boolean }) => {
    const cs = await UserCard.find({ code: { $in: o.cards } }).lean();
    return `${o.confirmed ? "✅" : "⏳"} **${names.get(id) ?? id}**\n${cs.map(cardLine).join("\n") || "*no cards*"}\n${coins(o.coins)}`;
  };
  const status = t.status === "pending" ? `Waiting for ${mention(t.toId)} to accept.` : t.status === "open" ? "Add cards/coins, then both press **Confirm**." : `Trade **${t.status}**.`;
  const e = info(`🤝 **Trade \`${t.code}\`**\n${status}\n\n${await side(t.fromId, t.from!)}\n\n${await side(t.toId, t.to!)}`);
  const open = t.status === "open";
  const components =
    t.status === "pending"
      ? [row(btn(cid("trade", `accept:${t.code}`, t.toId), "Accept", ButtonStyle.Success), btn(cid("trade", `cancel:${t.code}`, "*"), "Decline", ButtonStyle.Danger))]
      : open
        ? [
            row(
              btn(cid("trade", `add:${t.code}`, "*"), "Add card"),
              btn(cid("trade", `coins:${t.code}`, "*"), "Set coins"),
              btn(cid("trade", `confirm:${t.code}`, "*"), "Confirm", ButtonStyle.Success),
              btn(cid("trade", `cancel:${t.code}`, "*"), "Cancel", ButtonStyle.Danger),
            ),
          ]
        : [];
  return { embeds: [e], components };
}

export async function renderAuction(code: string): Promise<Reply> {
  const a = await market.getAuction(code);
  const def = getCard(a.slug);
  const names = await market.usernames([a.sellerId, a.topBidderId]);
  const live = a.status === "active" && a.endsAt > new Date();
  const e = cardEmbed(def, { variant: a.variant, level: a.level, title: `🔨 Auction \`${a.code}\` · ${def.name}` }).addFields(
    { name: "Seller", value: names.get(a.sellerId) ?? a.sellerId, inline: true },
    { name: "Top bid", value: a.bids ? `${coins(a.topBid)} by ${names.get(a.topBidderId!) ?? "?"}` : `none (min ${coins(a.minBid)})`, inline: true },
    { name: live ? "Ends" : "Status", value: live ? `<t:${Math.floor(a.endsAt.getTime() / 1000)}:R>` : a.status, inline: true },
  );
  if (a.buyout) e.addFields({ name: "Buyout", value: coins(a.buyout), inline: true });
  const next = nextMinBid(a);
  return {
    embeds: [e],
    files: [cardFile(def.slug)],
    components: live
      ? [row(btn(cid("auc", `bid:${a.code}`, "*"), `Bid ${next.toLocaleString()}`, ButtonStyle.Primary), ...(a.buyout ? [btn(cid("auc", `buyout:${a.code}`, "*"), `Buyout ${a.buyout.toLocaleString()}`, ButtonStyle.Success)] : []), btn(cid("auc", `view:${a.code}`, "*"), "Refresh"))]
      : [],
  };
}

type Fight = Awaited<ReturnType<typeof battle.fight>>;
type BattleResult = Pick<Fight, "lanes" | "winner"> & Partial<Pick<Fight, "bonus">>;

/** Battle embed. `shown` < lanes reveals only the first lanes (used for the lane-by-lane animation). */
export function renderBattle(r: BattleResult, aName: string, bName: string, shown = r.lanes.length) {
  const lanes = r.lanes.map((l, i) => {
    if (i >= shown) return `**Lane ${i + 1}:** ${mood("thinking", "⚔️")} *clashing…*`;
    const side = (f: typeof l.a, p: number) => (f ? `${RARITY_EMOJI[f.def.rarity]} ${f.def.name} Lv${f.level} (${p})` : "*empty*");
    const mark = l.winner === "a" ? "⬅️" : l.winner === "b" ? "➡️" : "🤝";
    return `**Lane ${i + 1}:** ${side(l.a, l.pa)} ${mark} ${side(l.b, l.pb)}`;
  });
  const bonus = [r.bonus?.a.length && `**${aName}:** ${r.bonus.a.join(" · ")}`, r.bonus?.b.length && `**${bName}:** ${r.bonus.b.join(" · ")}`].filter(Boolean).join("\n");
  const head = `⚔️ **${aName}** vs **${bName}**${bonus ? `\n${bonus}` : ""}`;
  if (shown < r.lanes.length) return info(`${head}\n\n${lanes.join("\n")}`);
  const result = r.winner === "a" ? `${mood("victory", "🏆")} **${aName}** wins!` : r.winner === "b" ? `${mood("angry", "🏆")} **${bName}** wins!` : `${mood("thinking", "🤝")} Draw. No rewards.`;
  return info(`${head}\n\n${lanes.join("\n")}\n\n${result}\nWinner +${CONFIG.battleWinCoins} coins · loser +${CONFIG.battleLossCoins}. Deck cards gain XP.`);
}

/** Final battle message plus frames that reveal one lane at a time. */
export const battleReply = (r: BattleResult, aName: string, bName: string, footer?: string): Reply => {
  const final = renderBattle(r, aName, bName);
  if (footer) final.setFooter({ text: footer });
  const clip = fx(`battle-${r.winner ?? "draw"}`); // highlight (left = aName); the summary text reads fine without it
  if (clip) final.setImage(clip.url);
  return { embeds: [final], files: clip ? [clip.file] : [], frames: r.lanes.map((_, n) => ({ embeds: [renderBattle(r, aName, bName, n)] })) };
};

/** Confirmed purchase/sale: the text plus a small transaction clip in the thumbnail. */
export function txReply(text: string): Reply {
  const c = fx("market");
  const e = info(text);
  if (c) e.setThumbnail(c.url);
  return { embeds: [e], files: c ? [c.file] : [] };
}

/** Burrow collect: a tunnel frame, then the coins and the refreshed burrow. */
export async function burrowCollected(uid: string, got: number): Promise<Reply> {
  const tunnel = clipFrame("burrow", "🕳️ *Heading down the burrow…*");
  return { ...(await renderBurrow(uid)), content: `🕳️ Your bunnies dug up ${coins(got)}! 🐇💨`, frames: got > 0 && tunnel ? [tunnel] : [] };
}

/** A frame showing an effect clip under some text, held for the clip length. null if the clip isn't built. */
export function clipFrame(name: string, text: string, color?: number): Reply | null {
  const c = fx(name);
  return c ? { embeds: [info(text, color).setImage(c.url)], files: [c.file], ms: c.ms + 250 } : null;
}

const BIG = new Set<Rarity>(["legendary", "mythic", "secret"]);
/** Suspense frames before a card is revealed: rarer finds get extra build-up. */
export function revealFrames(rarity: Rarity, opening: string): Reply[] {
  const frames: Reply[] = [{ embeds: [info(opening)] }];
  if (isRarePlus(rarity)) frames.push({ embeds: [info("✨ *Something glimmers…*", RARITY_COLOR[rarity])] });
  if (BIG.has(rarity)) frames.push({ embeds: [info(`🌟 **A powerful ${rarity} aura fills the air!**`, RARITY_COLOR[rarity])] });
  return frames;
}

export const huntButtons = (uid: string, code: string) => [
  row(
    btn(cid("hunt", "1", uid), "Hunt again", ButtonStyle.Primary),
    btn(cid("hunt", "5", uid), "Hunt ×5"),
    btn(cid("hunt", "10", uid), "Hunt ×10"),
    btn(cid("card", code, uid), "Open card"),
    btn(cid("menu", "menu", uid), "Menu"),
  ),
];

/** Hunt 1, 5 or 10 times. Energy for the whole batch is spent at once (all or nothing). */
/** Set by the bot: posts a big pull to the server's announcement channel (if it has one). */
export const hooks = { bigPull: async (guildId: string, text: string) => void [guildId, text] };

export async function doHunt(uid: string, count = 1, guildId?: string | null): Promise<Reply> {
  const h = await player.huntMany(uid, count);
  const en = await player.getEnergy(uid);
  const cost = CONFIG.energyCost.hunt;
  const best = h.cards.reduce((x, y) => (RARITIES.indexOf(y.card.rarity) > RARITIES.indexOf(x.card.rarity) ? y : x));
  const fresh = h.cards.filter((c) => c.isNew).length;
  const big = BIG.has(best.card.rarity);
  const bigText = `${RARITY_EMOJI[best.card.rarity]} ${best.variant !== "normal" ? variantInfo(best.variant).name + " " : ""}**${best.card.name}**`;
  if (big && guildId) void hooks.bigPull(guildId, `🌟 ${mention(uid)} just pulled ${bigText} (${best.card.rarity})!`).catch(() => {});
  const extra = [
    big && `🌟 **${best.card.rarity.toUpperCase()} PULL!** 🌟`,
    fresh && `🆕 **New to your Dex!** ${fresh > 1 ? `+${fresh} · ` : ""}📖 ${h.dex}/${CARDS.length}`,
    h.cards.some((c) => c.pity) && "✨ Pity bonus!",
    h.cards.some((c) => c.clover) && "🍀 Clover active",
    h.leveledUp && `🎉 You reached **level ${h.level}**!`,
    ...h.titles.map((t) => `🏅 Set complete! Title **${t}** + ${coins(CONFIG.setRewardCoins)}`),
  ].filter(Boolean).join("\n");
  const fullAt = en.energy < en.max ? ` · full <t:${Math.floor((Date.now() + energyWaitMs(en, en.max)) / 1000)}:R>` : "";
  const status = [
    { name: `${GEM} Energy`, value: `${bar(en.energy, en.max, 6)} ${en.energy}/${en.max}${fullAt}`, inline: true },
    { name: `${GEM} Next hunt`, value: en.energy >= cost ? "✅ Ready" : `⏳ in ${formatDuration(energyWaitMs(en, cost))}`, inline: true },
    { name: `${GEM} Pity`, value: `${bar(CONFIG.pityHunts - h.pityIn, CONFIG.pityHunts, 6)} rare+ in **${h.pityIn}**`, inline: true },
  ];
  const e = count === 1
    ? cardEmbed(best.card, { variant: best.variant, title: `🌿 You found ${RARITY_EMOJI[best.card.rarity]} ${best.variant !== "normal" ? best.variant + " " : ""}${best.card.name}!`, image: "full" })
        .addFields({ name: `${GEM} Code`, value: `\`${best.code}\``, inline: true }, ...status)
    // Multi: every card on its own line (readable without media); the best pull is the picture.
    : cardEmbed(best.card, { variant: best.variant, title: `🌿 Hunt ×${count}: best pull ${RARITY_EMOJI[best.card.rarity]} ${best.card.name}!`, image: "full" })
        .setDescription(h.cards.map((c) => `${RARITY_EMOJI[c.card.rarity]} ${c.variant !== "normal" ? `*${c.variant}* ` : ""}**${c.card.name}** · \`${c.code}\`${c.isNew ? " 🆕" : ""}${c === best ? " ⭐" : ""}`).join("\n"))
        .setFields(status);
  e.setFooter({ text: `+${h.xpGained} XP${h.xpGained < CONFIG.huntXp * count ? " (half XP after 100 hunts today)" : ""} · ${count > 1 ? `×${count} · ` : ""}costs ⚡${cost * count}` });
  const opening = count > 1 ? `🌿 *You sweep the meadow ${count} times…*` : "🌿 *You push through the tall grass…*";
  const clip = clipFrame(`hunt-${best.card.rarity}`, opening); // the result is already confirmed; the clip only builds up to it
  return { content: extra || undefined, embeds: [e], files: [cardFile(best.card.slug)], components: huntButtons(uid, best.code), frames: clip ? [clip, ...revealFrames(best.card.rarity, opening).slice(big ? 1 : 3)] : revealFrames(best.card.rarity, opening) };
}

// ================= Commands =================

const energyText = (e: { energy: number; max: number; nextInMs: number }) =>
  `${e.energy}/${e.max}${e.energy < e.max ? ` (+1 in ${formatDuration(e.nextInMs)})` : ""}`;

/** `bd help` overview, or one topic's commands. The menu lets the asker switch topics. */
export function renderHelp(uid: string, query = ""): Reply {
  const s = findGuide(query);
  const site = PUBLIC_URL.replace(/\/$/, "");
  let text: string;
  if (s) {
    const lines = s.commands.map((c) => `\`${P} ${c.usage}\`${c.aliases ? ` *(${c.aliases.join(", ")})*` : ""}\n${c.desc}`);
    text = `${s.emoji} **${s.title}**\n${s.intro}\n\n${lines.join("\n\n")}${site && s.web ? `\n\n🌐 Also on the web: ${site}${s.web}` : ""}`;
  } else {
    const miss = query ? `No help for \`${query}\`. ` : "";
    const topics = GUIDE.map((g) => `${g.emoji} **${g.title}** · \`${P} help ${g.key}\`\n${g.commands.map((c) => `\`${c.usage.split(" ")[0]}\``).filter((v, i, a) => a.indexOf(v) === i).join(" ")}`);
    text = `**🐰 BunnyDex command guide** · prefix \`${P}\`\n${miss}Pick a topic below, or \`${P} help <command>\`.\n\n${topics.join("\n")}${site ? `\n\n🌐 Full guide: ${site}/guide` : ""}`;
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(cid("help", "", uid))
    .setPlaceholder("Choose a topic")
    .addOptions([{ label: "Overview", value: "overview", emoji: "📖" }, ...GUIDE.map((g) => ({ label: g.title, value: g.key, emoji: g.emoji, default: g === s }))]);
  return { embeds: [info(text, VIOLET).setThumbnail(MASCOT_URL)], files: [mascotFile()], components: [row(menu)] };
}

const USABLE = ["clover", "juice", "burrow-key"];

const commands: Record<string, Handler> = {
  async menu({ uid, name }) {
    return renderMenu(uid, name);
  },

  async help({ uid, args }) {
    return renderHelp(uid, args.join(" "));
  },

  async profile({ name: myName, uid, args }) {
    const target = mentionId(args[0]) ?? uid;
    const [p, en] = await Promise.all([player.profile(target), player.getEnergy(target)]);
    const u = p.user;
    const name = target === uid ? myName : (u.username || target);
    const e = embed()
      .setColor(BRAND)
      .setTitle(`🐰 ${name}`)
      .addFields(
        { name: "Level", value: `${p.lvl.level} ${bar(p.lvl.into, p.lvl.need, 6)}\n${p.lvl.into}/${p.lvl.need} XP`, inline: true },
        { name: "Coins", value: coins(u.coins), inline: true },
        { name: "Dex", value: `${bar(p.collected, p.total, 6)}\n${p.collected}/${p.total} · ${p.cards} cards`, inline: true },
        { name: "Energy", value: `${bar(en.energy, en.max, 6)}\n${energyText(en)}`, inline: true },
        { name: "Hunts", value: String(u.stats?.hunts ?? 0), inline: true },
        { name: "Battles", value: `${u.stats?.battlesWon ?? 0}W / ${u.stats?.battlesLost ?? 0}L`, inline: true },
        { name: "Slots", value: `Burrow ${burrowSlots(u.level, u.extraBurrowSlots)} · Auctions ${auctionSlots(u.level)}`, inline: true },
        { name: "Daily streak", value: `🔥 ${u.streak ?? 0}`, inline: true },
        { name: "Shards", value: `💠 ${u.shards ?? 0}`, inline: true },
        { name: "Tower", value: `🏰 floor ${u.towerFloor ?? 0}/${CONFIG.towerMaxFloor}`, inline: true },
        ...(u.wishlist?.length ? [{ name: "⭐ Wishlist", value: player.wishNames(u.wishlist).join(", ") }] : []),
        { name: "Titles", value: u.titles?.length ? u.titles.map((t) => `🏅 ${t}`).join(" · ") : "*Complete an element in your Dex*" },
      );
    if (u.titles?.length) e.setTitle(`🐰 ${name} · 🏅 ${u.titles.at(-1)}`);
    const show = u.showcase ? await UserCard.findOne({ code: u.showcase, ownerId: target }).lean() : null;
    if (!show) {
      if (target === uid) e.setFooter({ text: `Show off a card here: ${P} showcase <code>` });
      return { embeds: [e] };
    }
    e.addFields({ name: "🌟 Showcase", value: cardLine(show) }).setImage(`attachment://${show.slug}.png`).setColor(RARITY_COLOR[getCard(show.slug).rarity]);
    return { embeds: [e], files: [cardFile(show.slug)] };
  },

  async bal({ uid }) {
    return `You have ${coins((await player.getUser(uid)).coins)}`;
  },

  async energy({ uid }) {
    const e = await player.getEnergy(uid);
    const full = e.energy >= e.max ? "Full!" : `Full in ${formatDuration(energyWaitMs(e, e.max))}.`;
    return `⚡ ${bar(e.energy, e.max)} **${energyText(e)}** · ${full}\nhunt ${CONFIG.energyCost.hunt} · work ${CONFIG.energyCost.work} · battle random ${CONFIG.energyCost.battle}`;
  },

  async daily({ uid }) {
    const d = await player.daily(uid);
    const days = Array.from({ length: 7 }, (_, i) => (i < d.day ? "🟧" : "⬜")).join("");
    const bonus = d.bonus ? `\n🎁 **Day 7 bonus:** ${RARITY_EMOJI[d.bonus.card.rarity]} ${d.bonus.variant !== "normal" ? d.bonus.variant + " " : ""}**${d.bonus.card.name}** \`${d.bonus.code}\`` : "";
    const next = d.day === 7 ? "a new week (day 1)" : `day ${d.day + 1}: ${coins(streakCoins(d.streak + 1))}${d.day === 6 ? " + a 🎁 rare+ bunny" : ""}`;
    return `📅 **Daily · 🔥 ${d.streak}-day streak**\n${days} day ${d.day}/7\n\n${coins(d.coins)}, 🥕 ×${d.carrots} and a full ⚡ energy bar (${d.energy}/${d.max}).${bonus}\n\nTomorrow: ${next}. Skip 2 days and the streak resets.`;
  },

  async work({ uid }) {
    const w = await player.work(uid);
    // Kept to one quick reply (no frames) so repeat work stays fast; the payout clip sits in the thumbnail.
    const e = info(`💼 You tended the carrot fields and earned ${coins(w.coins)}.${w.leveledUp ? `\n🎉 Level **${w.level}**!` : ""}`)
      .addFields(
        { name: `${GEM} Energy`, value: `⚡ ${w.energy}/${w.maxEnergy}`, inline: true },
        { name: `${GEM} Next work`, value: w.energy >= CONFIG.energyCost.work ? "✅ Ready" : `⏳ in ${formatDuration(energyWaitMs(await player.getEnergy(uid), CONFIG.energyCost.work))}`, inline: true },
      )
      .setFooter({ text: `costs ⚡${CONFIG.energyCost.work} · pays ${CONFIG.workMin}–${CONFIG.workMax}` });
    const c = fx("work");
    if (c) e.setThumbnail(c.url);
    return { embeds: [e], files: c ? [c.file] : [] };
  },

  async hunt({ uid, args, guildId }) {
    return doHunt(uid, args[0] ? Number(args[0]) : 1, guildId); // bd hunt 5 / bd hunt 10
  },

  async col({ uid, args }) {
    const rarity = RARITIES.find((r) => r === args[0]?.toLowerCase());
    const page = Number(args.find((a) => /^\d+$/.test(a))) || 1;
    return renderCollection(uid, page, rarity);
  },

  async dex({ uid }) {
    const earned = await cards.claimSets(uid);
    const p = await cards.collectionProgress(uid);
    const done = new Set(completedSets(p.ownedSlugs));
    const sets = p.element.map((el) => `${done.has(el.key) ? "🏅" : "▫️"} ${el.key} ${el.owned}/${el.total}${done.has(el.key) ? ` · **${setTitle(el.key)}**` : ""}`).join("\n");
    const news = earned.map((t) => `🎉 Set complete! Title **${t}** + ${coins(CONFIG.setRewardCoins)}\n`).join("");
    const lines = p.rarity.map((r) => `${RARITY_EMOJI[r.key]} ${r.key.padEnd(9)} ${bar(r.owned, r.total)} ${r.owned}/${r.total}`);
    const missing = CARDS.filter((c) => !p.ownedSlugs.has(c.slug)).map((c) => c.name);
    return { embeds: [info(`${news}📖 **Dex ${p.owned}/${p.total}**\n\`\`\`\n${lines.join("\n")}\n\`\`\`${missing.length ? `Missing: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}` : "🎉 Complete!"}\n\n**Element sets** (finish one for a title + ${coins(CONFIG.setRewardCoins)})\n${sets}`)] };
  },

  async card({ uid, args }) {
    const q = need(args.join(" ") || undefined, "card <name or code>");
    const owned = /^[0-9a-z]{6}$/i.test(q) ? await UserCard.findOne({ code: q.toLowerCase() }).lean() : null;
    const def = owned ? getCard(owned.slug) : (findCard(q) ?? fail("NOT_FOUND", "No card by that name."));
    const e = cardEmbed(def, { variant: owned?.variant, level: owned?.level, image: "full" });
    if (owned?.ownerId === uid) return renderCardPanel(uid, owned.code); // your own card: show action buttons
    if (owned) e.setFooter({ text: `${owned.code} · owner ${owned.ownerId} · ${owned.status} · value ~${cardValue(def, owned.variant, owned.level)}` });
    return { embeds: [e], files: [cardFile(def.slug)] };
  },

  async feed({ uid, args }) {
    const target = need(args[0], "feed <card code> <fodder codes…> | carrot [qty]");
    const what = need(args[1], "feed <card code> <fodder codes…> | carrot [qty]").toLowerCase();
    if (what === "carrot" || what === "golden-carrot") {
      const r = await cards.feed(uid, target, { item: what, qty: args[2] ? int(args[2], "Quantity") : 1 });
      return `🥕 Nom nom! **${r.card.name}** munched the carrots: +${r.gained} XP → Lv ${r.level}${r.level > r.from ? " 🎉" : ""}${r.capped ? " (max level)" : ""}`;
    }
    const fodder = args.slice(1, 11);
    // Feeding destroys cards, so confirm first.
    const list = await UserCard.find({ ownerId: uid, code: { $in: fodder.map((f) => f.toLowerCase()) } }).lean();
    return {
      embeds: [info(`🍽️ Feed these to \`${target}\`? **They will be destroyed.**\n${list.map(cardLine).join("\n") || "*none of those codes are yours*"}`)],
      components: [row(btn(cid("feed", `${target}:${fodder.join(",")}`, uid), "Feed", ButtonStyle.Danger), btn(cid("cancel", "", uid), "Cancel"))],
    };
  },

  async combine({ uid, args }) {
    const table = RARITIES.filter((r) => nextRarity(r))
      .map((r) => `${RARITY_EMOJI[r]} ${r} → ${RARITY_EMOJI[nextRarity(r)!]} ${nextRarity(r)} · **${Math.round(COMBINE_CHANCE[r] * 100)}%**`)
      .join("\n");
    const howTo = `🧪 **Combine** ${COMBINE_COUNT} cards of the same rarity for a chance at a random card of the next rarity.\nIf it fails you keep only the most valuable one.\n\n${table}\n\nUsage: \`${P} combine <code> <code> <code>\` or \`${P} combine auto [rarity]\``;
    if (!args.length) {
      const mine = await availableCards(uid, UNLOCKED);
      return {
        embeds: [info(`${howTo}\n\nOr pick ${COMBINE_COUNT} cards below, or press 🤖 Auto pick (uses spare duplicates only):`)],
        components: [
          ...(mine.length >= COMBINE_COUNT ? [row(cardSelect(cid("cmbsel", "", uid), `🧪 Pick ${COMBINE_COUNT} cards of the same rarity`, mine, COMBINE_COUNT, COMBINE_COUNT))] : []),
          row(btn(cid("menu", "combine auto", uid), "🤖 Auto pick", ButtonStyle.Primary)),
        ],
      };
    }
    if (args[0].toLowerCase() === "auto") {
      const want = args[1]?.toLowerCase() as Rarity | undefined;
      if (want && !RARITIES.includes(want)) fail("INVALID", `Unknown rarity \`${args[1]}\`. Try: ${RARITIES.join(", ")}.`);
      const { deck } = await player.getUser(uid);
      const picks = autoPick(await availableCards(uid, { code: { $nin: deck }, ...UNLOCKED }), want) ??
        fail("INVALID", `You need ${COMBINE_COUNT} spare ${want ?? "same-rarity"} duplicates to auto combine. Your best copy of each bunny and your deck are never used.`);
      args = picks.map((c) => c.code);
    }
    const codes = [...new Set(args.map((a) => a.toLowerCase()))];
    if (codes.length !== COMBINE_COUNT) fail("INVALID", `Pick exactly ${COMBINE_COUNT} different card codes. Usage: \`${P} combine <code> <code> <code>\``);
    const list = await UserCard.find({ ownerId: uid, code: { $in: codes } }).lean();
    if (list.length !== COMBINE_COUNT) fail("NOT_FOUND", "You don't own all of those cards. Check `bd col`.");
    const rarity = getCard(list[0].slug).rarity;
    if (list.some((c) => getCard(c.slug).rarity !== rarity)) fail("INVALID", "All cards must be the same rarity.");
    const up = nextRarity(rarity) ?? fail("INVALID", "Secret cards are already the top rarity.");
    return {
      embeds: [info(`🧪 Combine these for a **${Math.round(COMBINE_CHANCE[rarity] * 100)}%** chance at a ${RARITY_EMOJI[up]} **${up}** bunny?\n${list.map(cardLine).join("\n")}\n\n**On failure you keep only the most valuable one.**`)],
      components: [row(btn(cid("combine", codes.join(","), uid), "Combine", ButtonStyle.Danger), btn(cid("cancel", "", uid), "Cancel"))],
    };
  },

  async sell({ uid, args }) {
    const code = need(args[0], "sell <card code>");
    const c = await cards.getOwnedCard(uid, code);
    const def = getCard(c.slug);
    const price = Math.max(1, Math.floor(cardValue(def, c.variant, c.level) * CONFIG.npcSellRate));
    return {
      embeds: [info(`Sell ${cardLine(c)} to the shop for ${coins(price)}?\n*Players usually pay more on the market: \`${P} market sell ${c.code} <price>\`*`)],
      components: [row(btn(cid("sell", c.code, uid), "Sell", ButtonStyle.Danger), btn(cid("cancel", "", uid), "Cancel"))],
    };
  },

  async burrow({ uid, args }) {
    const sub = args[0]?.toLowerCase();
    if (sub === "add") {
      const def = await cards.burrowAdd(uid, need(args[1], "burrow add <code>"));
      return { content: `🕳️ **${def.name}** moved into your burrow.`, ...(await renderBurrow(uid)) };
    }
    if (sub === "remove") {
      const r = await cards.burrowRemove(uid, need(args[1], "burrow remove <code>"));
      return `🐇 **${r.card.name}** left the burrow (collected ${coins(r.coins)}).`;
    }
    if (sub === "collect") return burrowCollected(uid, await cards.burrowCollect(uid));
    return renderBurrow(uid);
  },

  shop: ({ uid, args }) => renderShop(uid, args[0]?.toLowerCase(), Number(args[1]) || 1),

  async buy({ uid, args }) {
    const r = await player.buyItem(uid, need(args[0], "buy <item> [qty]").toLowerCase(), args[1] ? int(args[1], "Quantity") : 1);
    return `🧺 Into the basket: ${r.item.name} ×${r.qty} for ${coins(r.cost)}.`;
  },

  async inv({ uid }) {
    const u = await player.getUser(uid);
    const items = [...(u.items?.entries() ?? [])].filter(([, n]) => n > 0).map(([slug, n]) => `${itemInfo(slug)?.name ?? slug} ×${n}`);
    const extra = u.cloverHunts ? `\n🍀 Clover active for ${u.cloverHunts} more hunts` : "";
    const usable = USABLE.filter((slug) => (u.items?.get(slug) ?? 0) > 0);
    return {
      embeds: [info(`🎒 **Inventory**\n${items.join("\n") || "Empty. See `bd shop`."}${extra}\n\n${coins(u.coins)}`)],
      components: usable.length ? [row(...usable.map((slug) => btn(cid("use", slug, uid), `Use ${itemInfo(slug)?.name ?? slug}`, ButtonStyle.Primary)))] : [],
    };
  },

  async use({ uid, args }) {
    return player.consumeItem(uid, need(args[0], "use <item>").toLowerCase());
  },

  async deck({ uid, args }) {
    if (args.length) await cards.setDeck(uid, args);
    const team = await cards.getTeam(uid);
    const u = await player.getUser(uid);
    const note = u.deck.length ? "" : `\n*No deck set: using your ${CONFIG.teamSize} strongest. Set one with \`${P} deck <code> <code> <code>\`*`;
    const mine = await availableCards(uid);
    return {
      embeds: [info(`⚔️ **Battle deck** (lane order)\n${team.map((t, i) => `${i + 1}. ${cardLine({ ...t, slug: t.def.slug })}`).join("\n")}${note}`)],
      components: mine.length ? [row(cardSelect(cid("decksel", "", uid), `🛡️ Pick up to ${CONFIG.teamSize} cards (lane order)`, mine, 1, CONFIG.teamSize))] : [],
    };
  },

  async battle({ name, uid, args }) {
    if (args[0]?.toLowerCase() === "random") {
      const s = await battle.scout(uid);
      const team = (t: typeof s.a) => t.map((f, i) => `${i + 1}. ${RARITY_EMOJI[f.def.rarity]} ${f.def.name} Lv${f.level} · ${TRAITS[f.def.element].name}`).join("\n") || "*no cards*";
      return {
        embeds: [info(`${mood("thinking", "🔭")} **Scouting** ·${s.opponent.username || "a wild player"}\n${team(s.b)}\n\n**Your deck** (lane order)\n${team(s.a)}\n\n*Tip: element advantage gives +25% in a lane. Edit your deck to counter, or find another opponent.*`)],
        components: [row(
          btn(cid("battle", `go:${s.opponent.discordId}`, uid), `⚔️ Fight (⚡${CONFIG.energyCost.battle})`, ButtonStyle.Primary),
          btn(cid("menu", "battle random", uid), "🔄 Find another"),
          btn(cid("menu", "deck", uid), "🛡️ Edit deck"),
        )],
      };
    }
    if (!args.length) {
      const team = await cards.getTeam(uid);
      return {
        embeds: [info(`⚔️ **Battle**\nYour team: ${team.map((t) => `${RARITY_EMOJI[t.def.rarity]} ${t.def.name} Lv${t.level}`).join(" · ") || "*no cards*"}\n\nFight a random player (⚡${CONFIG.energyCost.battle}) or challenge someone. Winner +${CONFIG.battleWinCoins} coins.`)],
        components: [
          row(btn(cid("menu", "battle random", uid), "🎲 Random battle", ButtonStyle.Primary), btn(cid("menu", "deck", uid), "🛡️ Edit deck")),
          row(new UserSelectMenuBuilder().setCustomId(cid("challenge", "", uid)).setPlaceholder("🤺 Challenge a player")),
        ],
      };
    }
    const opp = mentionId(args[0]) ?? fail("INVALID", `Usage: \`${P} battle @user\` or \`${P} battle random\``);
    if (opp === uid) fail("INVALID", "You can't battle yourself.");
    await player.getUser(opp);
    return {
      content: `${mention(opp)}, **${name}** challenges you to a battle!`,
      components: [row(btn(cid("battle", `accept:${uid}`, opp), "Accept", ButtonStyle.Success), btn(cid("battle", `decline:${uid}`, opp), "Decline", ButtonStyle.Danger))],
    };
  },

  async trade({ uid, args }) {
    const sub = args[0]?.toLowerCase();
    const partner = mentionId(args[0]);
    if (partner) {
      await player.ensureUser(partner);
      return renderTrade(await trade.createTrade(uid, partner));
    }
    if (sub === "add") return renderTrade((await trade.addTradeCard(uid, need(args[1], "trade add <code>")))!);
    if (sub === "remove") return renderTrade((await trade.removeTradeCard(uid, need(args[1], "trade remove <code>")))!);
    if (sub === "coins") return renderTrade((await trade.setTradeCoins(uid, Number(need(args[1], "trade coins <amount>").replace(/,/g, ""))))!);
    if (sub === "confirm") {
      const r = await trade.confirmTrade(uid);
      return { content: r.settled ? "✅ Trade complete!" : "Confirmed. Waiting for your partner.", ...(await renderTrade(r.trade!)) };
    }
    if (sub === "cancel") {
      await trade.cancelTrade(uid);
      return "❌ Trade cancelled. Cards returned.";
    }
    return {
      embeds: [info(`🤝 **Trade**: pick a player below, or \`${P} trade @user\`.\nThen add cards and coins with the buttons, and both press **Confirm**.`)],
      components: [row(new UserSelectMenuBuilder().setCustomId(cid("tradewith", "", uid)).setPlaceholder("🤝 Trade with…"))],
    };
  },

  async market({ uid, args }) {
    const sub = args[0]?.toLowerCase();
    if (sub === "sell") {
      const l = await market.listForSale(uid, need(args[1], "market sell <code> <price>"), int(args[2], "Price"));
      return `🏷️ Listed **${getCard(l.slug).name}** for ${coins(l.price)} · listing \`${l.code}\` (expires in ${formatDuration(CONFIG.listingTtlMs)}).`;
    }
    if (sub === "buy") {
      const r = await market.buyListing(uid, need(args[1], "market buy <listing id>"));
      return txReply(`🛍️ You bought **${r.card.name}** for ${coins(r.listing.price)}! Check \`${P} col\`.`);
    }
    if (sub === "cancel") return `Listing cancelled. **${(await market.cancelListing(uid, need(args[1], "market cancel <listing id>"))).name}** is back in your collection.`;
    const mine = sub === "mine";
    const q = mine ? "" : args.join(" ");
    const def = q ? (findCard(q) ?? fail("NOT_FOUND", "No card by that name.")) : undefined;
    const rows = await market.searchListings({ slug: def?.slug, sellerId: mine ? uid : undefined });
    const sales = def ? await market.recentSales(def.slug) : [];
    const history = sales.length ? `\n📈 Recent sales: ${sales.map((s) => `${coins(s.price)}${s.variant !== "normal" ? ` (${s.variant})` : ""}`).join(" · ")}` : def ? "\n📈 No sales yet." : "";
    const lines = rows.map((l) => `\`${l.code}\` ${cardLine({ code: l.cardCode, slug: l.slug, variant: l.variant, level: l.level }).replace(/^`\w+` /, "")} · ${coins(l.price)}`);
    const title = mine ? "Your listings" : def ? `Market · ${def.name}` : "Market (cheapest first)";
    return {
      embeds: [info(`🏪 **${title}**\n${lines.join("\n") || "Nothing listed."}${history}\n\nBuy: \`${P} market buy <id>\` · Sell: \`${P} market sell <code> <price>\``)],
      components: rows.length && !mine ? [row(...rows.slice(0, 5).map((l) => btn(cid("mkt", `buy:${l.code}`, "*"), `Buy ${l.code}`, ButtonStyle.Primary)))] : [],
    };
  },

  async auction({ channelId, uid, args }) {
    const sub = args[0]?.toLowerCase();
    if (sub === "start") {
      const usage = "auction start <code> <minBid> <time e.g. 30m/6h/2d> [buyout]";
      const ms = parseDuration(need(args[3], usage)) ?? fail("INVALID", `Usage: \`${P} ${usage}\``);
      const a = await market.startAuction(uid, need(args[1], usage), int(args[2], "Minimum bid"), ms, args[4] ? int(args[4], "Buyout") : undefined, channelId);
      return { content: "🔨 Auction started!", ...(await renderAuction(a.code)) };
    }
    if (sub === "bid") {
      const code = need(args[1], "auction bid <id> <amount>");
      const r = await market.placeBid(uid, code, int(args[2], "Bid"));
      return { content: r.isBuyout ? "💰 Bought out! The card is yours." : `✅ You're the top bidder at ${coins(r.auction.topBid)}.`, ...(await renderAuction(code)) };
    }
    if (sub === "view") return renderAuction(need(args[1], "auction view <id>"));
    if (sub === "cancel") return `Auction cancelled. **${(await market.cancelAuction(uid, need(args[1], "auction cancel <id>"))).name}** is back in your collection.`;
    const rows = await market.listAuctions({ sellerId: sub === "mine" ? uid : undefined });
    const lines = rows.map((a) => {
      const price = a.bids ? `top ${coins(a.topBid)}` : `min ${coins(a.minBid)}`;
      return `\`${a.code}\` ${RARITY_EMOJI[getCard(a.slug).rarity]} **${getCard(a.slug).name}** Lv${a.level} · ${price} · ends <t:${Math.floor(a.endsAt.getTime() / 1000)}:R>`;
    });
    return {
      embeds: [info(`🔨 **Auctions** (ending soonest)\n${lines.join("\n") || "No auctions running."}\n\nView: \`${P} auction view <id>\` · Start: \`${P} auction start <code> <minBid> <time> [buyout]\``)],
      components: rows.length ? [row(...rows.slice(0, 5).map((a) => btn(cid("auc", `view:${a.code}`, "*"), `View ${a.code}`)))] : [],
    };
  },

  async tower({ uid }) {
    const u = await player.getUser(uid);
    const floor = (u.towerFloor ?? 0) + 1;
    if (floor > CONFIG.towerMaxFloor) return `🏰 You've cleared all ${CONFIG.towerMaxFloor} floors of the Meadow Tower. Legend!`;
    const foes = towerTeam(floor).map((f, i) => `${i + 1}. ${RARITY_EMOJI[f.def.rarity]} ${f.def.name} Lv${f.level} · ${TRAITS[f.def.element].name}`).join("\n");
    const mine = (await cards.getTeam(uid)).map((f, i) => `${i + 1}. ${RARITY_EMOJI[f.def.rarity]} ${f.def.name} Lv${f.level} · ${TRAITS[f.def.element].name}`).join("\n");
    const r = towerReward(floor);
    return {
      embeds: [info(`🏰 **Meadow Tower · floor ${floor}/${CONFIG.towerMaxFloor}** ${bar(floor - 1, CONFIG.towerMaxFloor)}\n${foes}\n\n**Your deck**\n${mine}\n\nReward: ${coins(r.coins)}${r.shards ? ` + 💠 ${r.shards} shards` : ""} · costs ⚡${CONFIG.energyCost.battle}`)],
      components: [row(btn(cid("tower", "fight", uid), `⚔️ Climb floor ${floor}`, ButtonStyle.Primary), btn(cid("menu", "deck", uid), "🛡️ Edit deck"), btn(cid("menu", "menu", uid), "🏠 Menu"))],
    };
  },

  async shard({ uid, args }) {
    const u = await player.getUser(uid);
    const rates = Object.entries(SHARD_YIELD).map(([r, n]) => `${RARITY_EMOJI[r as Rarity]} ${n}`).join(" · ");
    if (args.length) {
      const codes = [...new Set(args.map((a) => a.toLowerCase()))];
      if (codes.length > 12) fail("INVALID", "Up to 12 codes at a time. Use `bd shard` to break all spare duplicates at once.");
      const list = await UserCard.find({ ownerId: uid, code: { $in: codes } }).lean();
      if (!list.length) fail("NOT_FOUND", "You don't own any of those cards.");
      const total = list.reduce((s, c) => s + SHARD_YIELD[getCard(c.slug).rarity], 0);
      return {
        embeds: [info(`💠 Break these into **${total}** shards? They are destroyed.\n${list.map(cardLine).join("\n")}`)],
        components: [row(btn(cid("shard", list.map((c) => c.code).join(","), uid), "💠 Break them", ButtonStyle.Danger), btn(cid("cancel", "", uid), "Cancel"))],
      };
    }
    const dupes = await cards.spareDupes(uid);
    const total = dupes.reduce((s, c) => s + SHARD_YIELD[getCard(c.slug).rarity], 0);
    return {
      embeds: [info(`💠 **Shards: ${u.shards ?? 0}**\nBreak cards into shards, then craft the exact bunny you want: \`${P} craft <name>\` (costs 10× a card's shard value).\nPer card: ${rates}\n\n${dupes.length ? `You have **${dupes.length}** spare duplicates (worth 💠 ${total}). Your best copy of each bunny, locked cards and your deck are kept.` : "No spare duplicates right now."}`)],
      components: dupes.length ? [row(btn(cid("shard", "dupes", uid), `💠 Break ${dupes.length} duplicates`, ButtonStyle.Danger), btn(cid("menu", "menu", uid), "🏠 Menu"))] : [],
    };
  },

  async craft({ uid, args }) {
    const def = findCard(need(args.join(" ") || undefined, "craft <card name>")) ?? fail("NOT_FOUND", "No card by that name.");
    const r = await cards.craftCard(uid, def.slug);
    return { ...renderCardPanelLite(r.card, r.code), content: `💠 Crafted **${r.card.name}** for ${r.cost} shards! \`${r.code}\`` };
  },

  async gift({ uid, args }) {
    const to = mentionId(args[0]) ?? fail("INVALID", `Usage: \`${P} gift @user <card code>\``);
    const c = await cards.getOwnedCard(uid, need(args[1], "gift @user <card code>"));
    return {
      embeds: [info(`🎁 Give ${cardLine(c)} to ${mention(to)}? You can't take it back.`)],
      components: [row(btn(cid("gift", `${c.code}:${to}`, uid), "🎁 Send gift", ButtonStyle.Success), btn(cid("cancel", "", uid), "Cancel"))],
    };
  },

  async wish({ uid, args }) {
    if (args.length) {
      const def = findCard(args.join(" ")) ?? fail("NOT_FOUND", "No card by that name.");
      const on = await player.toggleWish(uid, def.slug);
      return on ? `⭐ Added **${def.name}** to your wishlist. Friends see it on your profile.` : `Removed **${def.name}** from your wishlist.`;
    }
    const u = await player.getUser(uid);
    return `⭐ **Wishlist** (${u.wishlist.length}/${CONFIG.wishlistMax})\n${player.wishNames(u.wishlist).join(", ") || "Empty."}\n\nAdd or remove: \`${P} wish <card name>\``;
  },

  async reroll({ uid, args }) {
    const c = await cards.getOwnedCard(uid, need(args[0], "reroll <card code>"));
    const cost = REROLL_COST[getCard(c.slug).rarity];
    return {
      embeds: [info(`🎲 Re-roll the variant of ${cardLine(c)} for ${coins(cost)}?\nCurrent: **${variantInfo(c.variant).name}**. The new one is random and **can be worse**.`)],
      components: [row(btn(cid("reroll", c.code, uid), "🎲 Re-roll", ButtonStyle.Danger), btn(cid("cancel", "", uid), "Cancel"))],
    };
  },

  async news() {
    return NEWS.slice(0, 3).map((n) => `📰 **${n.title}** · ${n.date}\n${n.lines.map((l) => `• ${l}`).join("\n")}`).join("\n\n");
  },

  async showcase({ uid, args }) {
    const c = await cards.getOwnedCard(uid, need(args[0], "showcase <card code>"));
    await User.updateOne({ discordId: uid }, { showcase: c.code });
    return `🌟 ${cardLine(c)} is now the star of your profile.`;
  },

  async announce({ guildId, channelId, args, canManage }) {
    if (!guildId) fail("INVALID", "Use this in a server channel.");
    if (!canManage) fail("INVALID", "Only members with **Manage Server** can set this.");
    if (args[0]?.toLowerCase() === "off") {
      await Guild.updateOne({ guildId }, { $unset: { announceChannelId: 1 } }, { upsert: true });
      return "📣 Big-pull announcements are off for this server.";
    }
    await Guild.updateOne({ guildId }, { announceChannelId: channelId }, { upsert: true });
    return `📣 Legendary, mythic and secret pulls in this server will be announced in <#${channelId}>. Turn off: \`${P} announce off\``;
  },

  async lock({ uid, args }) {
    const c = await cards.setLocked(uid, need(args[0], "lock <card code>"), true);
    return `🔒 ${cardLine(c)} is locked. It won't be fed, combined, sold, listed or traded until you \`${P} unlock ${c.code}\`.`;
  },

  async unlock({ uid, args }) {
    const c = await cards.setLocked(uid, need(args[0], "unlock <card code>"), false);
    return `🔓 ${cardLine(c)} is unlocked.`;
  },

  async quests({ uid, args }) {
    const { got, tutorialPaid } = args[0]?.toLowerCase() === "claim" ? await quests.claimQuests(uid) : { got: [], tutorialPaid: false };
    const b = await quests.questBoard(uid);
    const steps = b.tutorial ? `🐣 **First steps** (reward ${coins(CONFIG.tutorialCoins)} + 🍀 ×2)\n${b.tutorial.map((t) => `${t.done ? "✅" : "⬜"} ${t.label}`).join("\n")}\n\n` : "";
    const paid = tutorialPaid ? `🐣 First steps complete! ${coins(CONFIG.tutorialCoins)} + 🍀 ×2\n` : "";
    const line = (q: (typeof b.quests)[number]) => {
      const n = Math.min(q.progress, q.goal);
      const reward = [coins(q.coins), ...Object.entries(q.items ?? {}).map(([k, v]) => `${itemInfo(k)?.name ?? k} ×${v}`)].join(" + ");
      return `${q.claimed ? "✅" : n >= q.goal ? "🎁" : "⬜"} ${q.scope === "week" ? "**Weekly:** " : ""}${q.label} · ${bar(n, q.goal, 6)} ${n}/${q.goal}\n　${q.claimed ? "~~" : ""}${reward}${q.claimed ? "~~" : ""}`;
    };
    const claimed = got.length ? `🎉 Claimed ${got.length} quest${got.length > 1 ? "s" : ""}: ${coins(got.reduce((s, q) => s + q.coins, 0))}${got.some((q) => q.items) ? " + items" : ""}\n\n` : "";
    const ready = b.quests.some((q) => !q.claimed && q.progress >= q.goal) || !!b.tutorial?.every((t) => t.done);
    return {
      embeds: [info(`${paid}${claimed}${steps}📜 **Quests** · new daily quests <t:${Math.floor((Date.now() + b.resetInMs) / 1000)}:R>\n\n${b.quests.map(line).join("\n")}`)],
      components: [row(
        btn(cid("menu", "quests claim", uid), "🎁 Claim rewards", ButtonStyle.Success, !ready),
        btn(cid("menu", "hunt", uid), "🌿 Hunt", ButtonStyle.Primary),
        btn(cid("menu", "battle random", uid), "🎲 Battle"),
        btn(cid("menu", "menu", uid), "🏠 Menu"),
      )],
    };
  },

  async lb({ uid, args, guildId }) {
    const kind = (["coins", "level", "collection"].find((k) => args.some((a) => a.toLowerCase() === k)) ?? "coins") as "coins";
    return renderLeaderboard(kind, uid, args.some((a) => a.toLowerCase() === "server") ? (guildId ?? undefined) : undefined);
  },
};

export async function renderLeaderboard(kind: "coins" | "level" | "collection", me?: string, guildId?: string): Promise<Reply> {
  const rows = await player.leaderboard(kind, 10, guildId);
  const scope = guildId ? "server" : "global";
  const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
  const fmt = (v: number) => (kind === "coins" ? coins(v) : kind === "level" ? `Lv ${v}` : `${v}/${CARDS.length}`);
  const menu = new StringSelectMenuBuilder().setCustomId(cid("lb", scope, "*")).addOptions(
    (["coins", "level", "collection"] as const).map((k) => ({ label: k, value: k, default: k === kind })),
  );
  const who = (r: (typeof rows)[number]) => `${r.username || r.discordId}${r.title ? ` *🏅${r.title}*` : ""}`;
  // Your own row is bold with a gem and "← you", so it's easy to find without relying on colour.
  const line = (r: (typeof rows)[number], i: number) =>
    r.discordId === me ? `${medal(i)} ${GEM} __${who(r)}__ · ${fmt(r.value)} ← **you**` : `${medal(i)} ${who(r)} · ${fmt(r.value)}`;
  const toggle = guildId ? btn(cid("lbs", `${kind}:global`, "*"), "🌍 Global") : btn(cid("lbs", `${kind}:server`, "*"), "🏠 This server");
  return { embeds: [info(`🏆 **Leaderboard · ${kind} · ${guildId ? "this server" : "global"}**\n${rows.map(line).join("\n") || "No players yet."}`)], components: [row(menu), row(toggle)] };
}

const ALIASES: Record<string, string> = {
  h: "hunt", p: "profile", start: "profile", me: "profile", cash: "bal", balance: "bal", collection: "col", c: "col",
  inventory: "inv", i: "inv", e: "energy", en: "energy", b: "battle", t: "trade", m: "market", auc: "auction", a: "auction", leaderboard: "lb", top: "lb",
  guide: "help", commands: "help", home: "menu", play: "menu", q: "quests", quest: "quests", shards: "shard", wishlist: "wish", patch: "news", tw: "tower", show: "showcase", fav: "showcase",
};

export function resolveCommand(name: string): Handler | undefined {
  return commands[ALIASES[name] ?? name];
}

/** Suggested next steps for replies that end without buttons of their own (after a buy, daily, sale, feed…). */
const NEXT: Record<string, [cmd: string, label: string][]> = {
  bal: [["shop", "🛒 Shop"], ["market", "🏪 Market"], ["daily", "📅 Daily"]],
  energy: [["hunt", "🌿 Hunt"], ["shop", "🛒 Shop"]],
  daily: [["hunt", "🌿 Hunt"], ["quests", "📜 Quests"], ["work", "💼 Work"]],
  lock: [["col", "📚 Collection"]],
  craft: [["col", "📚 Collection"], ["shard", "💠 Shards"]],
  gift: [["col", "📚 Collection"]],
  wish: [["dex", "📖 Dex"], ["market", "🏪 Market"]],
  reroll: [["col", "📚 Collection"]],
  news: [["quests", "📜 Quests"], ["tower", "🏰 Tower"]],
  unlock: [["col", "📚 Collection"]],
  work: [["work", "💼 Work again"], ["hunt", "🌿 Hunt"], ["shop", "🛒 Shop"]],
  feed: [["col", "📚 Collection"], ["combine", "🧪 Combine"]],
  sell: [["col", "📚 Collection"], ["shop", "🛒 Shop"], ["hunt", "🌿 Hunt"]],
  buy: [["inv", "🎒 Inventory"], ["shop", "🛒 Shop"], ["hunt", "🌿 Hunt"]],
  use: [["inv", "🎒 Inventory"], ["hunt", "🌿 Hunt"]],
  burrow: [["burrow", "🕳️ Burrow"], ["col", "📚 Collection"]],
  market: [["market", "🏪 Market"], ["col", "📚 Collection"]],
  auction: [["auction list", "🔨 Auctions"], ["col", "📚 Collection"]],
  battle: [["battle random", "🎲 Battle again"], ["deck", "🛡️ Deck"]],
  deck: [["battle random", "🎲 Random battle"], ["col", "📚 Collection"]],
  dex: [["hunt", "🌿 Hunt"], ["col", "📚 Collection"]],
  card: [["col", "📚 Collection"], ["combine", "🧪 Combine"]],
  showcase: [["profile", "👤 Profile"], ["col", "📚 Collection"]],
};
export function nextButtons(cmd: string, uid: string) {
  const steps = (NEXT[ALIASES[cmd] ?? cmd] ?? []).map(([c, label], i) => btn(cid("menu", c, uid), label, i ? ButtonStyle.Secondary : ButtonStyle.Primary));
  return [row(...steps, btn(cid("menu", "menu", uid), "🏠 Menu"))];
}

const LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.values(NEXT).flat()),
  daily: "📅 Daily", energy: "⚡ Energy", shard: "💠 Shards", work: "💼 Work", hunt: "🌿 Hunt", "trade cancel": "✖️ Cancel trade",
};

/** Buttons for an error: commands the message names (`bd shop`), plus a fix for the kind of error, so it's never a dead end. */
export function errorButtons(message: string, code: string | undefined, uid: string) {
  const named = [...message.matchAll(new RegExp("`" + P + " ([^`<@]+)`", "g"))].map((m) => m[1].trim());
  const fix =
    code === "COOLDOWN" && /energy/i.test(message) ? ["energy", "shop"]
    : code === "INSUFFICIENT_FUNDS" && /shard/i.test(message) ? ["shard"]
    : code === "INSUFFICIENT_FUNDS" && !named.length ? ["work", "daily"]
    : /card|code/i.test(message) && code !== "COOLDOWN" ? ["col"]
    : [];
  const cmds = [...new Set([...named, ...fix])].filter((c) => c.length <= 60 && c !== "menu").slice(0, 4); // "menu" already has its own button (duplicate ids are rejected)
  return [row(...cmds.map((c, i) => btn(cid("menu", c, uid), LABEL[c] ?? `▶️ ${P} ${c}`, i ? ButtonStyle.Secondary : ButtonStyle.Primary)), btn(cid("menu", "menu", uid), "🏠 Menu"))];
}

/** Shop: pick a product (menu) and a quantity (buttons), then press Buy. The choice lives in the customIds, so no state is kept. */
export async function renderShop(uid: string, slug?: string, qty = 1, note?: string): Promise<Reply> {
  const item = ITEMS.find((i) => i.slug === slug) ?? ITEMS[0];
  const { left, resetInMs } = await player.shopLimitsLeft(uid);
  const lines = ITEMS.map((i) => {
    const lim = i.dailyLimit ? ` · **${left[i.slug]}/${i.dailyLimit} left today**` : "";
    return `${i.slug === item.slug ? "▶️ " : ""}**${i.name}** \`${i.slug}\` · ${coins(i.price)}${lim}\n${i.description}`;
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(cid("shopsel", String(qty), uid))
    .addOptions(ITEMS.map((i) => ({ label: i.name.slice(0, 100), description: `${i.price.toLocaleString()} coins each`, value: i.slug, default: i.slug === item.slug })));
  qty = Math.min(100, Math.max(1, qty)); // buyItem allows 1–100
  const step = (d: number) => btn(cid("shopq", `${item.slug}:${qty + d}`, uid), d > 0 ? `+${d}` : `−${-d}`, ButtonStyle.Secondary, qty + d < 1 || qty + d > 100);
  const qtys = [step(-5), step(-1), btn(cid("noop", "qty", uid), `×${qty}`, ButtonStyle.Primary, true), step(1), step(5)];
  const buy = btn(cid("shopgo", `${item.slug}:${qty}`, uid), `🛒 Buy ${item.name} ×${qty} · ${(item.price * qty).toLocaleString()} coins`.slice(0, 80), ButtonStyle.Success);
  return {
    content: note,
    embeds: [info(`🛒 **Shop**: pick a product and quantity, then press Buy. Or type \`${P} buy <item> [qty]\`.\n\n${lines.join("\n\n")}\n\n*Daily limits reset in ${formatDuration(resetInMs)}.*`)],
    components: [row(menu), row(...qtys), row(buy, btn(cid("menu", "inv", uid), "🎒 Inventory"), btn(cid("menu", "menu", uid), "🏠 Menu"))],
  };
}

/** How many finished quests (and First steps) wait to be claimed. */
export async function readyQuests(uid: string) {
  const b = await quests.questBoard(uid);
  return b.quests.filter((q) => !q.claimed && q.progress >= q.goal).length + (b.tutorial?.every((t) => t.done) ? 1 : 0);
}

/**
 * Adds the player's status (energy, coins, level) to the last embed's footer, so any reply can be read at a glance,
 * and pops a "Quest complete!" note + Claim button when this action finished a quest (`readyBefore` = count before it).
 */
export async function withStatus(reply: Reply, uid: string, readyBefore?: number): Promise<Reply> {
  const [en, u, ready] = await Promise.all([player.getEnergy(uid), player.getUser(uid), readyBefore === undefined ? 0 : readyQuests(uid)]);
  const status = `⚡ ${en.energy}/${en.max} · 🪙 ${u.coins.toLocaleString()} · Lv ${u.level}`;
  const last = reply.embeds?.at(-1);
  if (last instanceof EmbedBuilder) {
    const t = last.data.footer?.text;
    last.setFooter({ text: t ? `${t}\n${status}` : status });
  }
  if (readyBefore !== undefined && ready > readyBefore) {
    reply.content = `${reply.content ? `${reply.content}\n` : ""}📜 **Quest complete!** Your reward is waiting.`;
    const rows = reply.components ?? [];
    if (rows.length < 5) reply.components = [...rows, row(btn(cid("menu", "quests claim", uid), "🎁 Claim quest", ButtonStyle.Success))];
  }
  return reply;
}

/** Runs a command by name. Used by text commands and by menu buttons, so both behave the same. */
export async function callCommand(name: string, ctx: Ctx): Promise<Reply> {
  const handler = resolveCommand(name);
  if (!handler) return { content: `Unknown command \`${name}\`. See \`${P} help\`.` };
  const before = await readyQuests(ctx.uid);
  const out = await handler(ctx);
  const reply: Reply = typeof out === "string" ? { embeds: [info(out)] } : out; // an embed, so it carries the player header too
  if (!reply.components?.length) reply.components = nextButtons(name, ctx.uid); // never a dead end
  return withStatus(reply, ctx.uid, before);
}

export async function runCommand(msg: Message, name: string, args: string[]) {
  if (!resolveCommand(name)) return { content: `Unknown command \`${name}\`. See \`${P} help\` or \`${P} menu\`.` };
  const { isNew } = await player.ensureUser(msg.author.id, msg.author.username);
  await player.seenIn(msg.author.id, msg.guildId);
  const canManage = !!msg.member?.permissions.has(PermissionFlagsBits.ManageGuild);
  const reply = await callCommand(name, { uid: msg.author.id, name: msg.author.displayName, channelId: msg.channelId, args, guildId: msg.guildId, canManage });
  if (isNew) {
    const welcome = `👋 Welcome to **BunnyDex**, ${msg.author.displayName}! You got ${coins(CONFIG.starterCoins)} and 4 starter bunnies. Try \`${P} hunt\` and \`${P} help\`.`;
    reply.content = reply.content ? `${welcome}\n\n${reply.content}` : welcome;
  }
  return reply;
}
