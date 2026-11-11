import { ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, type Message, type MessageCreateOptions } from "discord.js";
import { CARDS, RARITIES, findCard, getCard, type Rarity } from "../game/data/cards";
// shortcut: no per-command rate limit beyond game cooldowns; add one if spam becomes a problem.
import { COMBINE_CHANCE, COMBINE_COUNT, CONFIG, ITEMS, RARITY_EMOJI, itemInfo } from "../game/config";
import { fail } from "../game/errors";
import { GUIDE, findGuide } from "../game/guide";
import { UserCard, type TradeDoc } from "../game/models";
import { auctionSlots, autoPick, burrowSlots, cardValue, energyWaitMs, formatDuration, isRarePlus, nextMinBid, nextRarity, parseDuration } from "../game/rules";
import * as player from "../game/services/player";
import * as cards from "../game/services/cards";
import * as market from "../game/services/market";
import * as trade from "../game/services/trade";
import * as battle from "../game/services/battle";
import { fx } from "./fx";
import { BRAND, GEM, MASCOT_URL, RARITY_COLOR, VIOLET, btn, mascotFile, cardEmbed, cardFile, cardLine, cid, coins, embed, info, mention, row } from "./ui";

/** `frames` are shown first, one after another, by editing the message (a simple Discord "animation"). */
/** `frames` play first (message edits). `ms` = how long this frame stays up (default 900ms). */
export type Reply = Pick<MessageCreateOptions, "content" | "embeds" | "components" | "files"> & { frames?: Reply[]; ms?: number };
export type Ctx = { uid: string; name: string; channelId: string; args: string[] };
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
  const e = cardEmbed(def, { variant: c.variant, level: c.level }).setFooter({ text: `${c.code} · ${c.status} · value ~${cardValue(def, c.variant, c.level)} · XP ${c.xp}/${50 * c.level}` });
  const a = (act: string, label: string, style = ButtonStyle.Secondary) => btn(cid("cp", `${act}:${c.code}`, uid), label, style);
  const components =
    c.status === "available"
      ? [
          row(a("burrow", "🕳️ Burrow"), a("carrot", "🥕 Feed carrot"), a("feedsel", "🍽️ Feed cards"), a("combine", "🧪 Combine")),
          row(a("market", "🏷️ Sell on market"), a("auction", "🔨 Auction"), a("sell", "💰 Sell to shop", ButtonStyle.Danger)),
        ]
      : c.status === "burrow"
        ? [row(a("carrot", "🥕 Feed carrot"), a("unburrow", "🐇 Take out of burrow"))]
        : [];
  return { content: note, embeds: [e], files: [cardFile(def.slug)], components };
}

export async function renderMenu(uid: string, name: string): Promise<Reply> {
  const [en, u] = await Promise.all([player.getEnergy(uid), player.getUser(uid)]);
  const m = (cmd: string, label: string, style = ButtonStyle.Secondary) => btn(cid("menu", cmd, uid), label, style);
  return {
    embeds: [
      info(`${GEM} **${name}'s BunnyDex**\n${coins(u.coins)} · Level ${u.level} · ⚡ ${energyText({ ...en })}\n\nTap a button. Cards can be picked from menus, no codes needed.`)
        .setThumbnail(MASCOT_URL),
    ],
    files: [mascotFile()],
    components: [
      row(m("hunt", "🌿 Hunt", ButtonStyle.Primary), m("work", "💼 Work"), m("daily", "📅 Daily"), m("battle", "⚔️ Battle"), m("profile", "👤 Profile")),
      row(m("col", "📚 Collection"), m("burrow", "🕳️ Burrow"), m("combine", "🧪 Combine"), m("deck", "🛡️ Deck"), m("dex", "📖 Dex")),
      row(m("shop", "🛒 Shop"), m("inv", "🎒 Inventory"), m("market", "🏪 Market"), m("auction", "🔨 Auctions"), m("lb", "🏆 Top")),
      row(m("help", "❓ Help")),
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
  const menu = new StringSelectMenuBuilder()
    .setCustomId(cid("colr", "", uid))
    .setPlaceholder("Filter by rarity")
    .addOptions([{ label: "All rarities", value: "all" }, ...RARITIES.map((r) => ({ label: r, value: r, emoji: RARITY_EMOJI[r], default: r === rarity }))]);
  const r = rarity ?? "all";
  return {
    embeds: [e],
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

type BattleResult = Awaited<ReturnType<typeof battle.fight>>;

/** Battle embed. `shown` < lanes reveals only the first lanes (used for the lane-by-lane animation). */
export function renderBattle(r: BattleResult, aName: string, bName: string, shown = r.lanes.length) {
  const lanes = r.lanes.map((l, i) => {
    if (i >= shown) return `**Lane ${i + 1}:** ⚔️ *clashing…*`;
    const side = (f: typeof l.a, p: number) => (f ? `${RARITY_EMOJI[f.def.rarity]} ${f.def.name} Lv${f.level} (${p})` : "*empty*");
    const mark = l.winner === "a" ? "⬅️" : l.winner === "b" ? "➡️" : "🤝";
    return `**Lane ${i + 1}:** ${side(l.a, l.pa)} ${mark} ${side(l.b, l.pb)}`;
  });
  if (shown < r.lanes.length) return info(`⚔️ **${aName}** vs **${bName}**\n\n${lanes.join("\n")}`);
  const result = r.winner === "a" ? `🏆 **${aName}** wins!` : r.winner === "b" ? `🏆 **${bName}** wins!` : "🤝 Draw. No rewards.";
  return info(`⚔️ **${aName}** vs **${bName}**\n\n${lanes.join("\n")}\n\n${result}\nWinner +${CONFIG.battleWinCoins} coins · loser +${CONFIG.battleLossCoins}. Deck cards gain XP.`);
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
  return { ...(await renderBurrow(uid)), content: `🕳️ Collected ${coins(got)} from your burrow!`, frames: got > 0 && tunnel ? [tunnel] : [] };
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
    btn(cid("hunt", "5", uid), "Hunt ×5", ButtonStyle.Primary),
    btn(cid("hunt", "10", uid), "Hunt ×10", ButtonStyle.Primary),
    btn(cid("card", code, uid), "Open card"),
    btn(cid("menu", "menu", uid), "Menu"),
  ),
];

/** Hunt 1, 5 or 10 times. Energy for the whole batch is spent at once (all or nothing). */
export async function doHunt(uid: string, count = 1): Promise<Reply> {
  const h = await player.huntMany(uid, count);
  const en = await player.getEnergy(uid);
  const cost = CONFIG.energyCost.hunt;
  const best = h.cards.reduce((x, y) => (RARITIES.indexOf(y.card.rarity) > RARITIES.indexOf(x.card.rarity) ? y : x));
  const extra = [h.cards.some((c) => c.pity) && "✨ Pity bonus!", h.cards.some((c) => c.clover) && "🍀 Clover active", h.leveledUp && `🎉 You reached **level ${h.level}**!`].filter(Boolean).join(" · ");
  const status = [
    { name: `${GEM} Energy`, value: `⚡ ${en.energy}/${en.max}`, inline: true },
    { name: `${GEM} Next hunt`, value: en.energy >= cost ? "✅ Ready" : `⏳ in ${formatDuration(energyWaitMs(en, cost))}`, inline: true },
  ];
  const e = count === 1
    ? cardEmbed(best.card, { variant: best.variant, title: `🌿 You found ${RARITY_EMOJI[best.card.rarity]} ${best.variant !== "normal" ? best.variant + " " : ""}${best.card.name}!`, image: "full" })
        .addFields({ name: `${GEM} Code`, value: `\`${best.code}\``, inline: true }, ...status)
    // Multi: every card on its own line (readable without media); the best pull is the picture.
    : cardEmbed(best.card, { variant: best.variant, title: `🌿 Hunt ×${count}: best pull ${RARITY_EMOJI[best.card.rarity]} ${best.card.name}!`, image: "full" })
        .setDescription(h.cards.map((c) => `${RARITY_EMOJI[c.card.rarity]} ${c.variant !== "normal" ? `*${c.variant}* ` : ""}**${c.card.name}** · \`${c.code}\`${c === best ? " ⭐" : ""}`).join("\n"))
        .setFields(status);
  e.setFooter({ text: `+${CONFIG.huntXp * count} XP · ${count > 1 ? `×${count} · ` : ""}costs ⚡${cost * count}` });
  const opening = count > 1 ? `🌿 *You sweep the meadow ${count} times…*` : "🌿 *You push through the tall grass…*";
  const clip = clipFrame(`hunt-${best.card.rarity}`, opening); // the result is already confirmed; the clip only builds up to it
  return { content: extra || undefined, embeds: [e], files: [cardFile(best.card.slug)], components: huntButtons(uid, best.code), frames: clip ? [clip] : revealFrames(best.card.rarity, opening) };
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
        { name: "Level", value: `${p.lvl.level} (${p.lvl.into}/${p.lvl.need} XP)`, inline: true },
        { name: "Coins", value: coins(u.coins), inline: true },
        { name: "Dex", value: `${p.collected}/${p.total} · ${p.cards} cards`, inline: true },
        { name: "Energy", value: energyText(en), inline: true },
        { name: "Hunts", value: String(u.stats?.hunts ?? 0), inline: true },
        { name: "Battles", value: `${u.stats?.battlesWon ?? 0}W / ${u.stats?.battlesLost ?? 0}L`, inline: true },
        { name: "Slots", value: `Burrow ${burrowSlots(u.level, u.extraBurrowSlots)} · Auctions ${auctionSlots(u.level)}`, inline: true },
      );
    return { embeds: [e] };
  },

  async bal({ uid }) {
    return `You have ${coins((await player.getUser(uid)).coins)}`;
  },

  async energy({ uid }) {
    const e = await player.getEnergy(uid);
    const full = e.energy >= e.max ? "Full!" : `Full in ${formatDuration(energyWaitMs(e, e.max))}.`;
    const bar = "▰".repeat(Math.round((Math.min(e.energy, e.max) / e.max) * 10)).padEnd(10, "▱");
    return `⚡ ${bar} **${energyText(e)}** · ${full}\nhunt ${CONFIG.energyCost.hunt} · work ${CONFIG.energyCost.work} · battle random ${CONFIG.energyCost.battle}`;
  },

  async daily({ uid }) {
    const d = await player.daily(uid);
    return `📅 Daily claimed: ${coins(d.coins)}, 🥕 ×${d.carrots} and a full ⚡ energy bar (${d.energy}/${d.max}). Come back tomorrow!`;
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

  async hunt({ uid, args }) {
    return doHunt(uid, args[0] ? Number(args[0]) : 1); // bd hunt 5 / bd hunt 10
  },

  async col({ uid, args }) {
    const rarity = RARITIES.find((r) => r === args[0]?.toLowerCase());
    const page = Number(args.find((a) => /^\d+$/.test(a))) || 1;
    return renderCollection(uid, page, rarity);
  },

  async dex({ uid }) {
    const p = await cards.collectionProgress(uid);
    const bar = (o: number, t: number) => "▰".repeat(Math.round((o / t) * 10)).padEnd(10, "▱");
    const lines = p.rarity.map((r) => `${RARITY_EMOJI[r.key]} ${r.key.padEnd(9)} ${bar(r.owned, r.total)} ${r.owned}/${r.total}`);
    const missing = CARDS.filter((c) => !p.ownedSlugs.has(c.slug)).map((c) => c.name);
    return { embeds: [info(`📖 **Dex ${p.owned}/${p.total}**\n\`\`\`\n${lines.join("\n")}\n\`\`\`${missing.length ? `Missing: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}` : "🎉 Complete!"}`)] };
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
      return `🥕 **${r.card.name}** gained ${r.gained} XP → Lv ${r.level}${r.level > r.from ? " 🎉" : ""}${r.capped ? " (max level)" : ""}`;
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
      const mine = await availableCards(uid);
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
      const picks = autoPick(await availableCards(uid, { code: { $nin: deck } }), want) ??
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

  async shop({ uid }) {
    const { left, resetInMs } = await player.shopLimitsLeft(uid);
    const lines = ITEMS.map((i) => {
      const lim = i.dailyLimit ? ` · **${left[i.slug]}/${i.dailyLimit} left today**` : "";
      return `**${i.name}** \`${i.slug}\` · ${coins(i.price)}${lim}\n${i.description}`;
    });
    const menu = (qty: number) =>
      new StringSelectMenuBuilder()
        .setCustomId(cid("shopbuy", String(qty), uid))
        .setPlaceholder(`🛒 Buy ×${qty}`)
        .addOptions(ITEMS.map((i) => ({ label: `${i.name} ×${qty}`.slice(0, 100), description: `${(i.price * qty).toLocaleString()} coins`, value: i.slug })));
    return {
      embeds: [info(`🛒 **Shop**: pick from the menus, or \`${P} buy <item> [qty]\`\n\n${lines.join("\n\n")}\n\n*Daily limits reset in ${formatDuration(resetInMs)}.*`)],
      components: [row(menu(1)), row(menu(5))],
    };
  },

  async buy({ uid, args }) {
    const r = await player.buyItem(uid, need(args[0], "buy <item> [qty]").toLowerCase(), args[1] ? int(args[1], "Quantity") : 1);
    return `🛒 Bought ${r.item.name} ×${r.qty} for ${coins(r.cost)}.`;
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
      const r = await battle.randomFight(uid);
      return battleReply(r, name, r.opponent.username || "a wild player", r.lvl?.leveledUp ? `🎉 You reached level ${r.lvl.level}!` : undefined);
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
    const lines = rows.map((l) => `\`${l.code}\` ${cardLine({ code: l.cardCode, slug: l.slug, variant: l.variant, level: l.level }).replace(/^`\w+` /, "")} · ${coins(l.price)}`);
    const title = mine ? "Your listings" : def ? `Market · ${def.name}` : "Market (cheapest first)";
    return {
      embeds: [info(`🏪 **${title}**\n${lines.join("\n") || "Nothing listed."}\n\nBuy: \`${P} market buy <id>\` · Sell: \`${P} market sell <code> <price>\``)],
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

  async lb({ uid, args }) {
    return renderLeaderboard((["coins", "level", "collection"].find((k) => k === args[0]?.toLowerCase()) ?? "coins") as "coins", uid);
  },
};

export async function renderLeaderboard(kind: "coins" | "level" | "collection", me?: string): Promise<Reply> {
  const rows = await player.leaderboard(kind);
  const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
  const fmt = (v: number) => (kind === "coins" ? coins(v) : kind === "level" ? `Lv ${v}` : `${v}/${CARDS.length}`);
  const menu = new StringSelectMenuBuilder().setCustomId(cid("lb", "", "*")).addOptions(
    (["coins", "level", "collection"] as const).map((k) => ({ label: k, value: k, default: k === kind })),
  );
  // Your own row is bold with a gem and "← you", so it's easy to find without relying on colour.
  const line = (r: (typeof rows)[number], i: number) =>
    r.discordId === me ? `${medal(i)} **${GEM} ${r.username || r.discordId} · ${fmt(r.value)}** ← you` : `${medal(i)} ${r.username || r.discordId} · ${fmt(r.value)}`;
  return { embeds: [info(`🏆 **Leaderboard · ${kind}**\n${rows.map(line).join("\n") || "No players yet."}`)], components: [row(menu)] };
}

const ALIASES: Record<string, string> = {
  h: "hunt", p: "profile", start: "profile", me: "profile", cash: "bal", balance: "bal", collection: "col", c: "col",
  inventory: "inv", i: "inv", e: "energy", en: "energy", b: "battle", t: "trade", m: "market", auc: "auction", a: "auction", leaderboard: "lb", top: "lb",
  guide: "help", commands: "help", home: "menu", play: "menu",
};

export function resolveCommand(name: string): Handler | undefined {
  return commands[ALIASES[name] ?? name];
}

/** Runs a command by name. Used by text commands and by menu buttons, so both behave the same. */
export async function callCommand(name: string, ctx: Ctx): Promise<Reply> {
  const handler = resolveCommand(name);
  if (!handler) return { content: `Unknown command \`${name}\`. See \`${P} help\`.` };
  const out = await handler(ctx);
  return typeof out === "string" ? { embeds: [info(out)] } : out; // an embed, so it carries the player header too
}

export async function runCommand(msg: Message, name: string, args: string[]) {
  if (!resolveCommand(name)) return { content: `Unknown command \`${name}\`. See \`${P} help\` or \`${P} menu\`.` };
  const { isNew } = await player.ensureUser(msg.author.id, msg.author.username);
  const reply = await callCommand(name, { uid: msg.author.id, name: msg.author.displayName, channelId: msg.channelId, args });
  if (isNew) {
    const welcome = `👋 Welcome to **BunnyDex**, ${msg.author.displayName}! You got ${coins(CONFIG.starterCoins)} and 4 starter bunnies. Try \`${P} hunt\` and \`${P} help\`.`;
    reply.content = reply.content ? `${welcome}\n\n${reply.content}` : welcome;
  }
  return reply;
}
