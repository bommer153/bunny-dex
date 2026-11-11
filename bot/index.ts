import "dotenv/config";
import {
  ActionRowBuilder, Client, Events, type ButtonInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction, GatewayIntentBits, MessageFlags, ModalBuilder, Partials, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle, type Interaction, type MessageActionRowComponentBuilder, type ModalActionRowComponentBuilder,
} from "discord.js";
import { connectDb } from "../game/db";
import { COMBINE_COUNT, CONFIG, RARITY_EMOJI } from "../game/config";
import { getCard } from "../game/data/cards";
import { GameError } from "../game/errors";
import { UserCard } from "../game/models";
import * as player from "../game/services/player";
const { ensureUser } = player;
import * as cards from "../game/services/cards";
import * as market from "../game/services/market";
import * as trade from "../game/services/trade";
import * as battle from "../game/services/battle";
import {
  availableCards, battleReply, burrowCollected, callCommand, cardSelect, clipFrame, doHunt, renderAuction, revealFrames, txReply, renderBurrow, renderCardPanel, renderCollection, renderHelp, renderLeaderboard, renderMenu, renderTrade, runCommand,
  type Ctx, type Reply,
} from "./commands";
import { cardEmbed, cardFile, cardLine, cid, coins, info, mention, row } from "./ui";
import { fx, warmFx } from "./fx";
import { tryMedia } from "./media";
import { nextMinBid } from "../game/rules";
import type { Rarity } from "../game/data/cards";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing from .env");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

const errorText = (e: unknown) => {
  if (e instanceof GameError) return `❌ ${e.message}`;
  console.error(e);
  return "❌ Something went wrong. Try again in a moment.";
};

const dm = (id: string, text: string) => client.users.fetch(id).then((u) => u.send(text)).catch(() => {}); // DMs may be closed

// ================= Text commands =================

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  // Bare "bd" opens the button menu.
  const m = msg.content.trim().match(new RegExp(`^${CONFIG.prefix}(?:\\s+(\\S+)\\s*([\\s\\S]*))?$`, "i"));
  if (!m) return;
  const [, name = "menu", rest = ""] = m;
  try {
    const reply = await runCommand(msg, name.toLowerCase(), rest.split(/\s+/).filter(Boolean));
    if (reply) {
      await animate(reply, async (r) => {
        const m = await msg.reply({ ...r, allowedMentions: { repliedUser: false, parse: ["users"] } });
        return (next) => m.edit(updateWith(next));
      });
    }
  } catch (e) {
    await msg.reply({ content: errorText(e), allowedMentions: { repliedUser: false } }).catch(() => {});
  }
});

// ================= Buttons, menus, modals =================

const withoutFrames = (r: Reply): Omit<Reply, "frames" | "ms"> => { const { frames, ms, ...rest } = r; void frames; void ms; return rest; };
const updateWith = (r: Reply) => ({ ...withoutFrames(r), content: r.content ?? null, attachments: [], files: r.files ?? [] });

// ---- Frame "animation": send the first frame, then edit through the rest and land on the final reply. ----
const FRAME_MS = 900;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
type Edit = (r: Reply) => Promise<unknown>;
type AnySelect = StringSelectMenuInteraction | UserSelectMenuInteraction;

async function animate(reply: Reply, send: (r: Reply) => Promise<Edit>) {
  const { frames = [], ...final } = reply;
  if (!frames.length) return void (await tryMedia(final, send));
  const edit = await tryMedia(frames[0], send);
  let hold = frames[0].ms ?? FRAME_MS;
  for (const f of [...frames.slice(1), final]) {
    await sleep(hold);
    hold = f.ms ?? FRAME_MS;
    await tryMedia(f, edit).catch(() => {}); // message deleted mid-animation: nothing left to show
  }
}
const onReply = (i: ButtonInteraction | AnySelect) => async (r: Reply): Promise<Edit> => {
  await i.reply(withoutFrames(r));
  return (next) => i.editReply(updateWith(next));
};
const onUpdate = (i: ButtonInteraction) => async (r: Reply): Promise<Edit> => {
  await i.update(updateWith(r));
  return (next) => i.editReply(updateWith(next));
};

// Combine shake frame: the rarer the cards, the wilder the cauldron.
const CAULDRON_SHAKE: Record<Rarity, string> = {
  common: "🫧 *The cauldron wobbles…*",
  uncommon: "🫧 *The cauldron rattles…*",
  rare: "💢 **The cauldron shakes!**",
  epic: "💥 **The cauldron shakes violently!** 💥",
  legendary: "💥💥 **The whole table is shaking!** 💥💥",
  mythic: "⚡💥 **THE GROUND TREMBLES!** 💥⚡",
  secret: "",
};

const ctxOf =(i: Interaction, args: string[] = []): Ctx => ({ uid: i.user.id, name: i.user.displayName, channelId: i.channelId ?? "", args });
const privately = (r: Reply) => ({ ...r, flags: MessageFlags.Ephemeral as const });

function modal(id: string, title: string, fields: [id: string, label: string, required: boolean, placeholder?: string][]) {
  const m = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const [fid, label, required, placeholder] of fields) {
    const t = new TextInputBuilder().setCustomId(fid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required);
    if (placeholder) t.setPlaceholder(placeholder);
    m.addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(t));
  }
  return m;
}

/** Card panel buttons: `cp|<act>:<code>|uid`. */
async function cardPanelButton(i: ButtonInteraction, act: string, code: string) {
  const uid = i.user.id;
  const panel = async (note: string) => i.update(updateWith(await renderCardPanel(uid, code, note)));
  switch (act) {
    case "burrow":
      return void (await panel(`🕳️ **${(await cards.burrowAdd(uid, code)).name}** moved into your burrow.`));
    case "unburrow": {
      const r = await cards.burrowRemove(uid, code);
      return void (await panel(`🐇 **${r.card.name}** left the burrow (collected ${coins(r.coins)}).`));
    }
    case "carrot": {
      const r = await cards.feed(uid, code, { item: "carrot", qty: 1 });
      return void (await panel(`🥕 +${r.gained} XP → Lv ${r.level}${r.level > r.from ? " 🎉" : ""}${r.capped ? " (max level)" : ""}`));
    }
    case "feedsel":
    case "combine": {
      const c = await cards.getOwnedCard(uid, code);
      const u = await ensureUser(uid);
      const rarity = getCard(c.slug).rarity;
      const pool = (await availableCards(uid)).filter((x) => x.code !== c.code && !u.user.deck.includes(x.code) && (act === "feedsel" || getCard(x.slug).rarity === rarity));
      const need = act === "combine" ? COMBINE_COUNT - 1 : 1;
      if (pool.length < need) {
        return void (await i.reply({ content: act === "combine" ? `You need ${need} more available **${rarity}** cards (not in your deck) to combine.` : "You have no other available cards to feed.", flags: MessageFlags.Ephemeral }));
      }
      const menu = act === "combine"
        ? cardSelect(cid("cpsel", `combine:${code}`, uid), `🧪 Pick ${need} more ${rarity} cards`, pool, need, need)
        : cardSelect(cid("cpsel", `feed:${code}`, uid), "🍽️ Pick cards to feed (they are destroyed)", pool, 1, 10);
      return void (await i.reply({ components: [row(menu)], flags: MessageFlags.Ephemeral }));
    }
    case "sell":
      return void (await i.reply(privately(await callCommand("sell", ctxOf(i, [code])))));
    case "market":
      return void (await i.showModal(modal(cid("cpm", `market:${code}`, uid), "Sell on the market", [["price", "Price (coins)", true, "e.g. 500"]])));
    case "auction":
      return void (await i.showModal(modal(cid("cpm", `auction:${code}`, uid), "Start an auction", [
        ["minBid", "Starting bid (coins)", true, "e.g. 100"],
        ["time", "Duration", true, "e.g. 30m, 6h, 2d"],
        ["buyout", "Buyout price (optional)", false],
      ])));
  }
}

async function handleInteraction(i: Interaction) {
  if (!i.isButton() && !i.isStringSelectMenu() && !i.isUserSelectMenu() && !i.isModalSubmit()) return;
  const [action, arg = "", owner = "*"] = i.customId.split("|");
  const uid = i.user.id;
  if (owner !== "*" && owner !== uid) {
    await i.reply({ content: "That button isn't for you.", flags: MessageFlags.Ephemeral });
    return;
  }
  await ensureUser(uid, i.user.username);

  if (i.isButton()) {
    const [sub, code] = arg.split(":");
    switch (action) {
      case "hunt":
        return animate(await doHunt(uid, Number(arg) || 1), onReply(i));
      case "menu": {
        if (arg === "menu") return void (await i.reply(await renderMenu(uid, i.user.displayName)));
        const [cmd, ...args] = arg.split(" ");
        return animate(await callCommand(cmd, ctxOf(i, args)), onReply(i));
      }
      case "card":
        return void (await i.reply(privately(await renderCardPanel(uid, arg))));
      case "cp":
        return cardPanelButton(i, sub, code);
      case "use": {
        const note = await player.consumeItem(uid, arg);
        return void (await i.update(updateWith({ ...(await callCommand("inv", ctxOf(i))), content: note })));
      }
      case "col": {
        const [page, rarity] = arg.split(":");
        return void (await i.update(updateWith(await renderCollection(uid, Number(page), rarity === "all" ? undefined : (rarity as Rarity)))));
      }
      case "burrow": {
        if (arg === "collect") return animate(await burrowCollected(uid, await cards.burrowCollect(uid)), onUpdate(i));
        return animate(await renderBurrow(uid), onUpdate(i));
      }
      case "feed": {
        const [target, list] = arg.split(":");
        const r = await cards.feed(uid, target, list.split(","));
        const skipped = r.skipped.length ? `\nSkipped (not available): ${r.skipped.join(", ")}` : "";
        return void (await i.update({ content: `🍽️ **${r.card.name}** gained ${r.gained} XP → Lv ${r.level}${r.level > r.from ? " 🎉" : ""}${r.capped ? " (max level)" : ""}${skipped}`, embeds: [], components: [] }));
      }
      case "combine": {
        const codes = arg.split(",");
        const inputs = await UserCard.find({ ownerId: uid, code: { $in: codes } }).lean(); // read before they're consumed
        const r = await cards.combine(uid, codes);
        const used = `**Fused:** ${inputs.map((c) => cardLine(c)).join(", ")}`;
        const opening = `🧪 *You drop ${COMBINE_COUNT} bunnies into the cauldron…*\n${CAULDRON_SHAKE[r.from]}`;
        // The outcome is confirmed above; the clip (success flash or fizzle) only plays it back.
        const clip = clipFrame(`combine-${r.from}-${r.success ? "ok" : "fail"}`, opening);
        const [mix, ...glow] = revealFrames(r.success ? r.card.rarity : r.from, opening);
        const frames: Reply[] = clip ? [clip] : [mix, ...(r.success ? glow : [])];
        if (!r.success) {
          return animate({ embeds: [info(`💨 **Poof!** The combine failed (${Math.round(r.chance * 100)}% chance).\nYou kept **${r.keptCard.name}** \`${r.kept}\`.\n\n${used}`, 0x52525b)], components: [], frames }, onUpdate(i));
        }
        const e = cardEmbed(r.card, { variant: r.variant, title: `🧪✨ Success! You got ${RARITY_EMOJI[r.card.rarity]} ${r.variant !== "normal" ? r.variant + " " : ""}${r.card.name}!`, image: "full" })
          .addFields({ name: "Inputs", value: used.replace("**Fused:** ", "") })
          .setFooter({ text: `Card code: ${r.code} · ${r.from} → ${r.card.rarity}` });
        return animate({ embeds: [e], files: [cardFile(r.card.slug)], components: [], frames }, onUpdate(i));
      }
      case "sell": {
        const r = await cards.npcSell(uid, arg);
        return animate({ ...txReply(`💰 Sold **${r.card.name}** for ${coins(r.coins)}.`), components: [] }, onUpdate(i));
      }
      case "cancel":
        return void (await i.update({ content: "Cancelled.", embeds: [], components: [] }));
      case "battle": {
        if (Date.now() - i.message.createdTimestamp > 5 * 60_000) return void (await i.update({ content: "⌛ This challenge expired.", components: [] }));
        if (sub === "decline") return void (await i.update({ content: `${mention(uid)} declined the battle.`, components: [] }));
        const r = await battle.fight(code, uid); // code = challenger's id
        const challenger = await client.users.fetch(code);
        return animate({ ...battleReply(r, challenger.displayName, i.user.displayName), components: [] }, onUpdate(i));
      }
      case "trade": {
        if (sub === "accept") return void (await i.update(updateWith(await renderTrade(await trade.acceptTrade(uid, code)))));
        if (sub === "cancel") {
          await trade.cancelTrade(uid, code);
          return void (await i.update(updateWith(await renderTrade(await trade.getTrade(code)))));
        }
        if (sub === "confirm") {
          const r = await trade.confirmTrade(uid, code);
          return void (await i.update(updateWith({ ...(await renderTrade(r.trade!)), content: r.settled ? "✅ Trade complete!" : undefined })));
        }
        if (sub === "add") {
          const mine = await UserCard.find({ ownerId: uid, status: "available" }).sort({ level: -1 }).limit(25).lean();
          if (!mine.length) return void (await i.reply({ content: "You have no available cards.", flags: MessageFlags.Ephemeral }));
          const menu = new StringSelectMenuBuilder()
            .setCustomId(`tradeadd|${code}:${i.message.id}|${uid}`)
            .setPlaceholder("Pick cards to offer")
            .setMaxValues(Math.min(mine.length, 10))
            .addOptions(mine.map((c) => ({ label: `${getCard(c.slug).name} Lv${c.level}${c.variant !== "normal" ? ` (${c.variant})` : ""}`.slice(0, 100), description: c.code, value: c.code })));
          return void (await i.reply({ components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)], flags: MessageFlags.Ephemeral }));
        }
        if (sub === "coins") {
          const modal = new ModalBuilder().setCustomId(`tradecoins|${code}:${i.message.id}|${uid}`).setTitle("Coins to offer");
          const input = new TextInputBuilder().setCustomId("amount").setLabel("Amount (0 to remove)").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input));
          return void (await i.showModal(modal));
        }
        return;
      }
      case "auc": {
        if (sub === "view") return void (await i.update(updateWith(await renderAuction(code))));
        const a = await market.getAuction(code);
        const amount = sub === "buyout" && a.buyout ? a.buyout : nextMinBid(a);
        const r = await market.placeBid(uid, code, amount);
        if (r.outbidId) void dm(r.outbidId, `📉 You were outbid on auction \`${code}\` (${getCard(a.slug).name}). Your ${r.refunded.toLocaleString()} coins were refunded.`);
        if (r.settled) void announceAuction(r.settled);
        await i.update(updateWith(await renderAuction(code)));
        return void (await i.followUp({ content: r.isBuyout ? "💰 Bought out! The card is yours." : `✅ You're the top bidder at ${coins(amount)}.`, flags: MessageFlags.Ephemeral }));
      }
      case "mkt": {
        const r = await market.buyListing(uid, code);
        void dm(r.listing.sellerId, `🛍️ Your **${r.card.name}** sold for ${r.listing.price.toLocaleString()} coins (you got ${r.sellerGets.toLocaleString()} after fees).`);
        const bought = txReply(`🛍️ ${mention(uid)} bought **${r.card.name}** for ${coins(r.listing.price)}!`);
        return animate(bought, async (x) => { await i.reply({ ...withoutFrames(x), allowedMentions: { parse: [] } }); return (n) => i.editReply(updateWith(n)); });
      }
    }
    return;
  }

  if (i.isStringSelectMenu()) {
    if (action === "colr") {
      const r = i.values[0];
      return void (await i.update(updateWith(await renderCollection(uid, 1, r === "all" ? undefined : (r as Rarity)))));
    }
    if (action === "pick") return void (await i.reply(privately(await renderCardPanel(uid, i.values[0]))));
    if (action === "bsel") {
      const code = i.values[0];
      const note = arg === "add"
        ? `🕳️ **${(await cards.burrowAdd(uid, code)).name}** moved in.`
        : await cards.burrowRemove(uid, code).then((r) => `🐇 **${r.card.name}** left (collected ${coins(r.coins)}).`);
      return void (await i.update(updateWith({ ...(await renderBurrow(uid)), content: note })));
    }
    if (action === "cmbsel") return void (await i.reply(privately(await callCommand("combine", ctxOf(i, i.values)))));
    if (action === "cpsel") {
      const [what, target] = arg.split(":");
      return void (await i.update(updateWith(await callCommand(what, ctxOf(i, [target, ...i.values])))));
    }
    if (action === "shopbuy") {
      const r = await player.buyItem(uid, i.values[0], Number(arg) || 1);
      return void (await i.reply({ content: `🛒 Bought ${r.item.name} ×${r.qty} for ${coins(r.cost)}.`, flags: MessageFlags.Ephemeral }));
    }
    if (action === "decksel") {
      await cards.setDeck(uid, i.values);
      return void (await i.update(updateWith({ ...(await callCommand("deck", ctxOf(i))), content: "✅ Deck saved." })));
    }
    if (action === "help") return void (await i.update(updateWith(renderHelp(uid, i.values[0] === "overview" ? "" : i.values[0]))));
    if (action === "lb") return void (await i.update(updateWith(await renderLeaderboard(i.values[0] as "coins", uid))));
    if (action === "tradeadd") {
      const [code, panelId] = arg.split(":");
      let t = await trade.getTrade(code);
      for (const c of i.values) t = (await trade.addTradeCard(uid, c))!;
      await i.update({ content: `Added ${i.values.length} card(s).`, components: [] });
      await refreshPanel(i.channel, panelId, t);
    }
    return;
  }

  if (i.isUserSelectMenu()) {
    const target = `<@${i.values[0]}>`;
    if (action === "challenge") return void (await i.reply(await callCommand("battle", ctxOf(i, [target]))));
    if (action === "tradewith") return void (await i.reply(await callCommand("trade", ctxOf(i, [target]))));
    return;
  }

  if (i.isModalSubmit() && action === "cpm") {
    const [what, code] = arg.split(":");
    const f = (k: string) => i.fields.getTextInputValue(k).trim();
    if (what === "market") return void (await i.reply(await callCommand("market", ctxOf(i, ["sell", code, f("price")]))));
    return void (await i.reply(await callCommand("auction", ctxOf(i, ["start", code, f("minBid"), f("time"), ...(f("buyout") ? [f("buyout")] : [])]))));
  }

  if (i.isModalSubmit() && action === "tradecoins") {
    const [, panelId] = arg.split(":");
    const t = await trade.setTradeCoins(uid, Number(i.fields.getTextInputValue("amount").replace(/,/g, "")));
    await i.reply({ content: "Coins updated.", flags: MessageFlags.Ephemeral });
    await refreshPanel(i.channel, panelId, t!);
  }
}

async function refreshPanel(channel: Interaction["channel"], messageId: string, t: Awaited<ReturnType<typeof trade.getTrade>>) {
  const m = await channel?.messages.fetch(messageId).catch(() => null);
  if (m) await m.edit(updateWith(await renderTrade(t))).catch(() => {});
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    await handleInteraction(i);
  } catch (e) {
    if (!i.isRepliable()) return;
    const payload = { content: errorText(e), flags: MessageFlags.Ephemeral as const };
    await (i.replied || i.deferred ? i.followUp(payload) : i.reply(payload)).catch(() => {});
  }
});

// ================= Background ticker: settle auctions, expire listings/trades =================

async function announceAuction(r: market.AuctionResult) {
  const name = getCard(r.slug).name;
  const text = r.winnerId
    ? `🔨 Auction \`${r.code}\` ended: ${mention(r.winnerId)} won **${name}** for ${coins(r.price)}. ${mention(r.sellerId)} received ${coins(r.sellerGets)} after fees.`
    : `🔨 Auction \`${r.code}\` for **${name}** ended with no bids. The card went back to ${mention(r.sellerId)}.`;
  const ch = r.channelId ? await client.channels.fetch(r.channelId).catch(() => null) : null;
  // A sale gets the hammer clip; the text above stays the full, readable result.
  const clip = r.winnerId ? fx("auction") : null;
  const media: Reply = clip ? { embeds: [info(`🔨 **SOLD!** ${name} · ${coins(r.price)}`, 0xfacc15).setImage(clip.url)], files: [clip.file] } : {};
  const allowedMentions = { users: [r.sellerId, ...(r.winnerId ? [r.winnerId] : [])] };
  if (ch?.isSendable()) await tryMedia({ content: text, ...media }, async (m) => void (await ch.send({ ...withoutFrames(m), allowedMentions }))).catch(() => {});
  else {
    void dm(r.sellerId, text);
    if (r.winnerId) void dm(r.winnerId, text);
  }
}

let ticking = false;
async function tick() {
  if (ticking) return; // never overlap
  ticking = true;
  try {
    for (const r of await market.settleDueAuctions()) await announceAuction(r);
    await market.expireListings();
    await trade.expireTrades();
  } catch (e) {
    console.error("ticker:", e);
  } finally {
    ticking = false;
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`BunnyDex bot ready as ${c.user.tag}`);
  // Effect clips build in the background; until then replies just go out without them.
  void warmFx().then((r) => console.log(`fx: ${r.count} clips ready in ${r.ms}ms`));
  setInterval(tick, 15_000);
  void tick();
});

connectDb()
  .then(() => {
    console.log("MongoDB connected");
    return client.login(token);
  })
  .catch((e) => {
    console.error("Startup failed:", e);
    process.exit(1);
  });
