import type { Message } from "discord.js";
import {
  UserService,
  HuntService,
  CardCatalogService,
  CardService,
  InventoryService,
  PackService,
  LootBoxService,
  ShopService,
  DailyService,
  WorkService,
  GamblingService,
  DeckService,
  BattleService,
  MatchmakingService,
  TradeService,
  MarketplaceService,
  CollectionService,
  AchievementService,
  QuestService,
  LeaderboardService,
  AdminService,
  EconomyService,
} from "@bunnydex/game";
import { parseAdminIds } from "@bunnydex/config";
import { formatError, identityFromDiscord, mentionId, reply, replyEmbed, replyCardGallery, wikiUrl } from "./util.js";
import type { LeaderboardKind, Variant } from "@bunnydex/types";

const adminIds = () => parseAdminIds(process.env.ADMIN_DISCORD_IDS ?? "");

export async function handleCommand(message: Message, args: string[]) {
  const cmd = (args[0] ?? "help").toLowerCase();
  const rest = args.slice(1);
  const id = identityFromDiscord(message.author);

  try {
    switch (cmd) {
      case "help":
      case "h":
        await replyEmbed(message, {
          title: "BunnyDex — Discover. Collect. Battle.",
          description: [
            "**Play in Discord** with the `bd` prefix.",
            "",
            "`bd start` `bd profile` `bd bal` `bd daily` `bd work`",
            "`bd hunt` `bd inv` `bd use <item>` `bd open <box>`",
            "`bd pack` `bd pack open <slug>` `bd card <name>` `bd collection`",
            "`bd shop` `bd buy <sku>` `bd flip` `bd slots` `bd dice`",
            "`bd deck` `bd battle random` `bd battle @user`",
            "`bd trade @user` `bd market` `bd quests` `bd achievements`",
            "",
            `[Open the wiki](${wikiUrl()}) for cards, commands, and sets.`,
            "`bd wiki` · `bd card meadow hop`",
          ].join("\n"),
          slug: "meadow-hop",
          footer: "Card art is shown on hunts, packs, and bd card",
        });
        break;

      case "wiki": {
        const page = rest[0]?.toLowerCase();
        const slugMap: Record<string, string> = {
          commands: "commands",
          bunnies: "bunnies",
          cards: "bunnies",
          economy: "economy",
          battle: "battle",
          start: "getting-started",
        };
        const path = slugMap[page ?? ""] ?? "";
        await replyEmbed(message, {
          title: "BunnyDex Wiki",
          description: `[Read the wiki](${wikiUrl(path)}) — commands, all 31 bunnies, economy, and battle rules.`,
          slug: "sunflare-bun",
        });
        break;
      }

      case "start":
      case "begin": {
        const result = await UserService.start(id);
        const starters = [
          { name: "Meadow Hop", rarity: "common", variant: "normal", slug: "meadow-hop" },
          { name: "Dewdrop Ears", rarity: "common", variant: "normal", slug: "dewdrop-ears" },
          { name: "Spark Whisk", rarity: "common", variant: "normal", slug: "spark-whisk" },
          { name: "Willow Guard", rarity: "common", variant: "normal", slug: "willow-guard" },
        ];
        if (result.created) {
          await replyCardGallery(
            message,
            `${result.message}\n🪙 Starter coins + your first flock.`,
            starters,
          );
        } else {
          await replyEmbed(message, {
            title: result.message,
            description: "Try `bd hunt`, `bd card meadow hop`, and `bd wiki`.",
            slug: "meadow-hop",
          });
        }
        break;
      }

      case "profile":
      case "stats": {
        const target = mentionId(rest[0]) ?? id.discordId;
        const user = await UserService.getProfile(target);
        await reply(
          message,
          [
            `**${user.displayName}** — Lv.${user.level}`,
            `XP ${user.xp} · 🪙 ${user.coins} · 💎 ${user.gems} · 🎟️ ${user.tickets}`,
            `Rating ${user.battleRating} · W/L ${user.stats?.wins ?? 0}/${user.stats?.losses ?? 0}`,
            `Cards ${user.stats?.cardsOwned ?? 0} · Unique ${user.stats?.collectionUnique ?? 0}`,
            `Hunts ${user.stats?.hunts ?? 0} · Ach score ${user.stats?.achievementScore ?? 0}`,
            user.activeTitle ? `Title: ${user.activeTitle}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        break;
      }

      case "bal":
      case "balance": {
        const user = await UserService.requireByDiscordId(id.discordId);
        await reply(message, `🪙 ${user.coins} · 💎 ${user.gems} · 🎟️ ${user.tickets}`);
        break;
      }

      case "daily": {
        const r = await DailyService.claim(id.discordId);
        await reply(message, `Daily claimed! +🪙 ${r.coins}`);
        break;
      }

      case "work": {
        const r = await WorkService.work(id.discordId);
        await reply(message, `You worked hard and earned 🪙 ${r.coins}`);
        break;
      }

      case "hunt": {
        const r = await HuntService.hunt(id.discordId);
        const reward = r.reward;
        const pity = r.pityHit ? "✨ Pity triggered!\n" : "";
        if (reward.type === "card") {
          await replyEmbed(message, {
            title: `You found ${reward.name}!`,
            description: `${pity}**${reward.rarity}** · ${reward.variant}`,
            slug: reward.slug,
            footer: "bd card <name> · wiki /wiki/bunnies",
          });
        } else if (reward.type === "coins") {
          await reply(message, `${pity}You found 🪙 ${reward.amount}`);
        } else if (reward.type === "gems") {
          await reply(message, `${pity}You found 💎 ${reward.amount}`);
        } else if (reward.type === "item") {
          await reply(message, `${pity}You found **${reward.itemSlug}** x${reward.quantity}`);
        } else {
          await reply(message, `${pity}Reward: ${JSON.stringify(reward)}`);
        }
        break;
      }

      case "inv":
      case "inventory": {
        const user = await UserService.requireByDiscordId(id.discordId);
        const items = await InventoryService.list(String(user._id));
        if (!items.length) {
          await reply(message, "Inventory empty.");
          break;
        }
        const lines = items.map((s) => {
          const def = s.itemDefinitionId as { name?: string; slug?: string };
          return `• ${def?.name ?? def?.slug} x${s.quantity}`;
        });
        await reply(message, ["**Inventory**", ...lines].join("\n"));
        break;
      }

      case "use": {
        const slug = rest[0];
        if (!slug) {
          await reply(message, "Usage: `bd use <item-slug>`");
          break;
        }
        const user = await UserService.requireByDiscordId(id.discordId);
        const result = await InventoryService.useItem(String(user._id), slug);
        if (result.kind === "loot_box") {
          await reply(message, `That's a loot box — use \`bd open ${slug}\`.`);
        } else {
          await reply(message, `Used **${result.def.name}**.`);
        }
        break;
      }

      case "open": {
        const boxSlug = rest[0];
        if (!boxSlug) {
          await reply(message, "Usage: `bd open <box-slug>`");
          break;
        }
        const r = await LootBoxService.open(id.discordId, boxSlug);
        if (r.reward.type === "card") {
          await replyEmbed(message, {
            title: `Opened ${boxSlug}`,
            description: `**${r.reward.name}** (${r.reward.rarity} · ${r.reward.variant})`,
            slug: r.reward.slug,
          });
        } else {
          await reply(message, `Opened **${boxSlug}** → ${JSON.stringify(r.reward)}`);
        }
        break;
      }

      case "pack": {
        if (rest[0] === "open" && rest[1]) {
          const r = await PackService.purchaseAndOpen(id.discordId, rest[1]);
          await replyCardGallery(
            message,
            `Opened ${r.pack.name}`,
            r.cards.map((c) => ({
              name: c.name,
              rarity: c.rarity,
              variant: c.variant,
              slug: c.slug,
            })),
          );
        } else {
          const packs = await PackService.list();
          await reply(
            message,
            [
              "**Packs**",
              ...packs.map(
                (p) =>
                  `• \`${p.slug}\` ${p.name} — ${p.cost.amount} ${p.cost.currency}`,
              ),
              "Open with `bd pack open <slug>`",
            ].join("\n"),
          );
        }
        break;
      }

      case "card": {
        const q = rest.join(" ");
        if (!q) {
          await reply(message, "Usage: `bd card <name>`");
          break;
        }
        const card = await CardCatalogService.getBySlugOrId(q);
        await replyEmbed(message, {
          title: card.name,
          description: card.description,
          slug: card.slug,
          fields: [
            { name: "Rarity", value: card.rarity, inline: true },
            { name: "Element", value: card.element, inline: true },
            { name: "Set", value: card.setId, inline: true },
            {
              name: "Stats",
              value: `ATK ${card.atk} · DEF ${card.def} · HP ${card.hp}`,
              inline: false,
            },
            { name: "Base value", value: String(card.baseValue), inline: true },
          ],
          footer: `Wiki: ${wikiUrl("bunnies")}`,
        });
        break;
      }

      case "cards": {
        const user = await UserService.requireByDiscordId(id.discordId);
        const cards = await CardService.getUserCards(String(user._id), "available");
        if (!cards.length) {
          await reply(message, "No cards. Try `bd hunt` or `bd start`.");
          break;
        }
        const first = cards[0];
        const def = first?.cardDefinitionId as { name?: string; slug?: string } | undefined;
        const lines = cards.slice(0, 20).map((c) => {
          const d = c.cardDefinitionId as { name?: string };
          return `• \`${c._id}\` ${d?.name ?? "?"} (${c.variant})`;
        });
        await replyEmbed(message, {
          title: `Your cards (${cards.length})`,
          description: lines.join("\n"),
          slug: def?.slug,
        });
        break;
      }

      case "collection": {
        const progress = await CollectionService.getProgress(id.discordId);
        const setLines = progress.sets.map(
          (s) => `• ${s.name}: ${s.owned}/${s.total}`,
        );
        await replyEmbed(message, {
          title: `Collection ${progress.completionPct}%`,
          description: [
            `${progress.unique}/${progress.catalogSize} unique`,
            ...setLines,
          ].join("\n"),
          slug: "aurora-myth",
          footer: "Wiki: all bunny portraits on /wiki/bunnies",
        });
        break;
      }

      case "shop": {
        const offers = await ShopService.list(rest[0]);
        await reply(
          message,
          [
            "**Shop**",
            ...offers.map(
              (o) =>
                `• \`${o.sku}\` [${o.category}] ${o.price.amount} ${o.price.currency}${o.featured ? " ⭐" : ""}`,
            ),
            "Buy: `bd buy <sku>`",
          ].join("\n"),
        );
        break;
      }

      case "buy": {
        const sku = rest[0];
        const qty = Number(rest[1] ?? 1);
        if (!sku) {
          await reply(message, "Usage: `bd buy <sku> [qty]`");
          break;
        }
        const r = await ShopService.buy(id.discordId, sku, qty);
        await reply(message, `Purchased \`${sku}\` x${qty} for ${r.total} ${r.currency}.`);
        break;
      }

      case "sell": {
        if (rest[0] === "card" && rest[1]) {
          const r = await MarketplaceService.npcSell(id.discordId, rest[1]);
          await reply(message, `Sold ${r.cardName} to NPC for 🪙 ${r.amount}`);
        } else {
          await reply(message, "Usage: `bd sell card <userCardId>`");
        }
        break;
      }

      case "flip": {
        const amount = Number(rest[0]);
        const side = rest[1] as "heads" | "tails";
        if (!amount || (side !== "heads" && side !== "tails")) {
          await reply(message, "Usage: `bd flip <amount> <heads|tails>`");
          break;
        }
        const r = await GamblingService.flip(id.discordId, amount, side);
        await reply(
          message,
          r.won
            ? `🪙 ${r.result}! You won ${r.payout}`
            : `🪙 ${r.result}. You lost ${amount}`,
        );
        break;
      }

      case "slots": {
        const amount = Number(rest[0]);
        if (!amount) {
          await reply(message, "Usage: `bd slots <amount>`");
          break;
        }
        const r = await GamblingService.slots(id.discordId, amount);
        await reply(
          message,
          `${r.reels.join(" | ")} → ${r.won ? `won 🪙 ${r.payout}` : "no win"}`,
        );
        break;
      }

      case "dice": {
        const amount = Number(rest[0]);
        const guess = Number(rest[1]);
        if (!amount || !guess) {
          await reply(message, "Usage: `bd dice <amount> <1-6>`");
          break;
        }
        const r = await GamblingService.dice(id.discordId, amount, guess);
        await reply(
          message,
          `Rolled ${r.roll}. ${r.won ? `Won 🪙 ${r.payout}` : "Lost."}`,
        );
        break;
      }

      case "deck": {
        await handleDeck(message, id.discordId, rest);
        break;
      }

      case "battle": {
        await handleBattle(message, id.discordId, rest);
        break;
      }

      case "trade": {
        await handleTrade(message, id.discordId, rest);
        break;
      }

      case "market": {
        await handleMarket(message, id.discordId, rest);
        break;
      }

      case "quests": {
        if (rest[0] === "claim" && rest[1]) {
          const r = await QuestService.claim(id.discordId, rest[1]);
          await reply(message, `Claimed **${r.quest.name}**!`);
        } else {
          const list = await QuestService.list(id.discordId);
          await reply(
            message,
            [
              "**Quests**",
              ...list.map(
                (q) =>
                  `• \`${q.slug}\` ${q.name} ${q.progress}/${q.criteria.target}${q.completed ? (q.claimed ? " ✅" : " — `bd quests claim " + q.slug + "`") : ""}`,
              ),
            ].join("\n"),
          );
        }
        break;
      }

      case "achievements": {
        const user = await UserService.requireByDiscordId(id.discordId);
        const list = await AchievementService.listForUser(String(user._id));
        await reply(
          message,
          [
            "**Achievements**",
            ...list.map(
              (a) => `• ${a.unlocked ? "✅" : "⬜"} **${a.name}** — ${a.description}`,
            ),
          ].join("\n"),
        );
        break;
      }

      case "leaderboard":
      case "lb": {
        const kind = (rest[0] ?? "wealth") as LeaderboardKind;
        const rows = await LeaderboardService.get(kind);
        await reply(
          message,
          [
            `**Leaderboard — ${kind}**`,
            ...rows.map(
              (r) =>
                `#${r.rank} ${r.displayName} · 🪙${r.coins} · ★${r.battleRating} · uniq ${r.collectionUnique}`,
            ),
          ].join("\n"),
        );
        break;
      }

      case "favorite": {
        if (!rest[0]) {
          await reply(message, "Usage: `bd favorite <userCardId>`");
          break;
        }
        await UserService.setFavorite(id.discordId, rest[0]);
        await reply(message, "Favorite card set.");
        break;
      }

      case "admin": {
        await handleAdmin(message, id.discordId, rest);
        break;
      }

      default:
        await reply(message, `Unknown command. Try \`bd help\`.`);
    }
  } catch (err) {
    await reply(message, formatError(err));
  }
}

async function handleDeck(message: Message, discordId: string, rest: string[]) {
  const sub = rest[0]?.toLowerCase();
  if (!sub) {
    const decks = await DeckService.list(discordId);
    await reply(
      message,
      decks.length
        ? ["**Decks**", ...decks.map((d) => `• ${d.isActive ? "✅" : "⬜"} **${d.name}** (${d.slots.length})`)].join("\n")
        : "No decks. `bd deck create <name>`",
    );
    return;
  }
  if (sub === "create" && rest[1]) {
    await DeckService.create(discordId, rest.slice(1).join(" "));
    await reply(message, `Deck created.`);
    return;
  }
  if (sub === "delete" && rest[1]) {
    await DeckService.remove(discordId, rest.slice(1).join(" "));
    await reply(message, "Deck deleted.");
    return;
  }
  if (sub === "use" && rest[1]) {
    await DeckService.setActive(discordId, rest.slice(1).join(" "));
    await reply(message, "Active deck set.");
    return;
  }
  if (sub === "view" && rest[1]) {
    const deck = await DeckService.view(discordId, rest.slice(1).join(" "));
    await reply(
      message,
      `**${deck.name}** (${deck.slots.length}) valid=${deck.validation?.isValid}\n${deck.slots.map((s) => s.userCardId).join(", ")}`,
    );
    return;
  }
  if (sub === "add" && rest[1] && rest[2]) {
    const name = rest[1];
    const cardId = rest[2];
    await DeckService.addCard(discordId, name, cardId);
    await reply(message, "Card added.");
    return;
  }
  if (sub === "remove" && rest[1] && rest[2]) {
    await DeckService.removeCard(discordId, rest[1], rest[2]);
    await reply(message, "Card removed.");
    return;
  }
  await reply(
    message,
    "Usage: `bd deck create|delete|use|view|add|remove …`",
  );
}

async function handleBattle(message: Message, discordId: string, rest: string[]) {
  const sub = rest[0]?.toLowerCase();
  if (sub === "random") {
    const r = await MatchmakingService.enqueueRandom(discordId, {
      guildId: message.guildId ?? undefined,
      channelId: message.channelId,
    });
    if ("queued" in r && r.queued) {
      await reply(message, r.message);
      return;
    }
    const result = r as Awaited<ReturnType<typeof BattleService.resolveMatch>>;
    await reply(
      message,
      formatBattle(result),
    );
    return;
  }
  if (sub === "history") {
    const rows = await BattleService.history(discordId);
    await reply(
      message,
      rows.length
        ? rows
            .map(
              (b) =>
                `• ${b.mode} winner=${b.winnerId ?? "draw"} seed=${String(b.seed).slice(0, 8)}`,
            )
            .join("\n")
        : "No battles yet.",
    );
    return;
  }
  const opp = mentionId(rest[0] === "accept" || rest[0] === "decline" ? rest[1] : rest[0]);
  if (opp) {
    const result = await BattleService.challenge(discordId, opp);
    await reply(message, formatBattle(result));
    return;
  }
  await reply(message, "Usage: `bd battle random` or `bd battle @user`");
}

function formatBattle(result: Awaited<ReturnType<typeof BattleService.resolveMatch>>) {
  const lines = result.lanes.map(
    (l) =>
      `Lane ${l.lane}: ${l.challengerCard.name} (${l.challengerScore}) vs ${l.opponentCard.name} (${l.opponentScore}) → ${l.winner}`,
  );
  return [
    `⚔️ **${result.challengerName}** vs **${result.opponentName}**`,
    ...lines,
    result.winnerId
      ? `Winner userId \`${result.winnerId}\``
      : "Draw!",
  ].join("\n");
}

async function handleTrade(message: Message, discordId: string, rest: string[]) {
  const sub = rest[0]?.toLowerCase();
  const partner = mentionId(rest[0]);
  if (partner) {
    const trade = await TradeService.create(discordId, partner);
    await reply(message, `Trade opened \`${trade._id}\`. Add cards then both \`bd trade confirm\`.`);
    return;
  }
  if (sub === "add" && rest[1]) {
    await TradeService.addCard(discordId, rest[1]);
    await reply(message, "Card added to trade.");
    return;
  }
  if (sub === "coins" && rest[1]) {
    await TradeService.addCoins(discordId, Number(rest[1]));
    await reply(message, "Coins set on trade offer.");
    return;
  }
  if (sub === "confirm") {
    const r = await TradeService.confirm(discordId);
    await reply(
      message,
      r.settled ? "Trade completed!" : "Confirmed. Waiting for partner.",
    );
    return;
  }
  if (sub === "cancel") {
    await TradeService.cancel(discordId);
    await reply(message, "Trade cancelled.");
    return;
  }
  await reply(message, "Usage: `bd trade @user` | `add` | `coins` | `confirm` | `cancel`");
}

async function handleMarket(message: Message, discordId: string, rest: string[]) {
  const sub = rest[0]?.toLowerCase();
  if (!sub || sub === "list") {
    const rows = await MarketplaceService.search({ limit: 10 });
    await reply(
      message,
      rows.length
        ? ["**Market**", ...rows.map((l) => `• \`${l._id}\` ${l.name} (${l.rarity}/${l.variant}) — 🪙${l.priceCoins}`)].join("\n")
        : "No listings.",
    );
    return;
  }
  if (sub === "search") {
    const rows = await MarketplaceService.search({ q: rest.slice(1).join(" ") });
    await reply(
      message,
      rows.map((l) => `• \`${l._id}\` ${l.name} — 🪙${l.priceCoins}`).join("\n") ||
        "No results.",
    );
    return;
  }
  if (sub === "sell" && rest[1] && rest[2]) {
    const listing = await MarketplaceService.sellCard(
      discordId,
      rest[1],
      Number(rest[2]),
    );
    await reply(message, `Listed for 🪙${listing.priceCoins} (\`${listing._id}\`)`);
    return;
  }
  if (sub === "buy" && rest[1]) {
    const r = await MarketplaceService.buy(discordId, rest[1]);
    await reply(message, `Purchased! Fee 🪙${r.fee}`);
    return;
  }
  if (sub === "cancel" && rest[1]) {
    await MarketplaceService.cancel(discordId, rest[1]);
    await reply(message, "Listing cancelled.");
    return;
  }
  if (sub === "mine") {
    const rows = await MarketplaceService.listMine(discordId);
    await reply(
      message,
      rows.map((l) => `• \`${l._id}\` ${l.name} — 🪙${l.priceCoins}`).join("\n") ||
        "No active listings.",
    );
    return;
  }
  await reply(message, "Usage: `bd market search|sell|buy|cancel|mine`");
}

async function handleAdmin(message: Message, discordId: string, rest: string[]) {
  const sub = rest[0]?.toLowerCase();
  const ids = adminIds();
  if (sub === "givecurrency") {
    const target = mentionId(rest[1]);
    const currency = rest[2] as "coins" | "gems" | "tickets";
    const amount = Number(rest[3]);
    if (!target || !currency || !amount) {
      await reply(message, "Usage: `bd admin givecurrency @user coins|gems|tickets <amt>`");
      return;
    }
    await AdminService.giveCurrency(discordId, target, currency, amount, ids);
    await reply(message, "Granted.");
    return;
  }
  if (sub === "givecard") {
    const target = mentionId(rest[1]);
    if (!target || !rest[2]) {
      await reply(message, "Usage: `bd admin givecard @user <slug> [variant]`");
      return;
    }
    await AdminService.giveCard(
      discordId,
      target,
      rest[2],
      (rest[3] as Variant) ?? "normal",
      ids,
    );
    await reply(message, "Card granted.");
    return;
  }
  if (sub === "giveitem") {
    const target = mentionId(rest[1]);
    if (!target || !rest[2]) {
      await reply(message, "Usage: `bd admin giveitem @user <slug> [qty]`");
      return;
    }
    await AdminService.giveItem(discordId, target, rest[2], Number(rest[3] ?? 1), ids);
    await reply(message, "Item granted.");
    return;
  }
  if (sub === "ban" || sub === "unban") {
    const target = mentionId(rest[1]);
    if (!target) {
      await reply(message, "Usage: `bd admin ban|unban @user`");
      return;
    }
    await AdminService.ban(discordId, target, sub === "ban", ids);
    await reply(message, sub === "ban" ? "Banned." : "Unbanned.");
    return;
  }
  if (sub === "inspect") {
    const target = mentionId(rest[1]);
    if (!target) return;
    const user = await AdminService.inspect(discordId, target, ids);
    await reply(message, "```json\n" + JSON.stringify(user.toObject(), null, 2).slice(0, 1800) + "\n```");
    return;
  }
  if (sub === "config") {
    const key = rest[1];
    const value = Number(rest[2]);
    if (!key || Number.isNaN(value)) {
      await reply(message, "Usage: `bd admin config <key> <number>`");
      return;
    }
    await AdminService.patchConfig(discordId, { [key]: value }, ids);
    await reply(message, "Config updated.");
    return;
  }
  await reply(message, "Admin: givecurrency|givecard|giveitem|ban|unban|inspect|config");
}

// silence unused import warning if tree-shaken oddly
void EconomyService;
