// Command guide shared by `bd help` (bot) and /guide (web), so both stay in sync.
import { COMBINE_CHANCE, COMBINE_COUNT, CONFIG, RARITY_WEIGHT, SHARD_YIELD, TRAITS } from "./config";

const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
/** Published hunt odds, e.g. "common 67.9% · uncommon 25% · …" (players trust games that show their rates). */
export const DROP_RATES = Object.entries(RARITY_WEIGHT).map(([r, w]) => `${r} ${+((w / total) * 100).toFixed(2)}%`).join(" · ");

export type GuideCommand = { usage: string; desc: string; aliases?: string[] };
export type GuideSection = { key: string; emoji: string; title: string; intro: string; web?: string; commands: GuideCommand[] };

const c = CONFIG.energyCost;

export const GUIDE: GuideSection[] = [
  {
    key: "start", emoji: "🐰", title: "Getting started", web: "/profile",
    intro: `Type any \`${CONFIG.prefix}\` command to join. You get ${CONFIG.starterCoins} coins and 4 starter bunnies.`,
    commands: [
      { usage: "menu", desc: "A button menu for everything. Just typing `bd` opens it too. Cards are picked from dropdowns, no codes needed.", aliases: ["home", "play"] },
      { usage: "help [topic|command]", desc: "This guide. Pick a topic, e.g. `help auction`." },
      { usage: "profile [@user]", desc: "Level, coins, dex progress, energy and stats.", aliases: ["p", "me", "start"] },
      { usage: "showcase <code>", desc: "Show off one card, big, on your profile.", aliases: ["show", "fav"] },
      { usage: "announce [off]", desc: "Server managers: post legendary, mythic and secret pulls from this server in this channel." },
      { usage: "bal", desc: "Your coin balance.", aliases: ["cash", "balance"] },
      { usage: "energy", desc: "Your energy bar and when it refills.", aliases: ["e", "en"] },
    ],
  },
  {
    key: "grind", emoji: "⚡", title: "Energy & grinding", web: "/profile",
    intro: `Chatting in a server sometimes makes a wild bunny appear: first to press Catch gets it. Energy refills +1 every minute. Hunt costs ${c.hunt}, work ${c.work}, random battle ${c.battle}. \`daily\` refills it and 🧃 Carrot Juice adds more.`,
    commands: [
      { usage: "hunt [5|10]", desc: `Find a wild bunny (⚡${c.hunt} each). Add 5 or 10 to hunt that many at once. Guaranteed rare+ after ${CONFIG.pityHunts} hunts without one. Odds: ${DROP_RATES}. Hunts after the first ${CONFIG.huntXpDailyCap} of the day give half XP.`, aliases: ["h"] },
      { usage: "work", desc: `Earn ${CONFIG.workMin}–${CONFIG.workMax} coins (⚡${c.work}).` },
      { usage: "daily", desc: `${CONFIG.dailyCoins}+ coins, 2 carrots and a full energy bar, once a day. Keep a streak: coins grow each day and day 7 gives a guaranteed rare+ bunny. Skip 2 days and it resets.` },
      { usage: "quests", desc: "3 daily quests and 1 weekly quest. Finish them, then press Claim for coins and items. New players also get a *First steps* checklist.", aliases: ["q", "quest"] },
      { usage: "news", desc: "What's new in the latest update.", aliases: ["patch"] },
    ],
  },
  {
    key: "cards", emoji: "📚", title: "Cards & leveling", web: "/collection",
    intro: "Every card has a 6-letter code (shown in your collection). Level cards by feeding them duplicates or carrots.",
    commands: [
      { usage: "col [rarity] [page]", desc: "Your collection, with rarity filter and pages.", aliases: ["c", "collection"] },
      { usage: "dex", desc: `Dex progress, missing bunnies and element sets. Owning every card of an element earns a title + ${CONFIG.setRewardCoins} coins.` },
      { usage: "lock <code>", desc: "🔒 Protect a card: it's never fed, combined, sold, listed or traded (auto combine skips it too)." },
      { usage: "unlock <code>", desc: "Remove the lock." },
      { usage: "shard [codes…]", desc: `Break cards into 💠 shards (${Object.entries(SHARD_YIELD).map(([r, n]) => `${r} ${n}`).join(", ")}). No codes offers to break all spare duplicates; your best copy of each bunny is kept.`, aliases: ["shards"] },
      { usage: "craft <card name>", desc: "Spend shards on the exact bunny you want (10× its shard value). Secret cards can't be crafted." },
      { usage: "reroll <code>", desc: "Pay coins to roll a new variant. It can roll down too!" },
      { usage: "wish [card name]", desc: `Toggle a card on your ⭐ wishlist (max ${CONFIG.wishlistMax}). It shows on your profile.`, aliases: ["wishlist"] },
      { usage: "gift @user <code>", desc: "Give a card to a friend (asks first)." },
      { usage: "card <name|code>", desc: "Card details and art." },
      { usage: "feed <code> <fodder codes…>", desc: "Feed up to 10 cards to one card for XP. The fodder is destroyed (asks first)." },
      { usage: "feed <code> carrot [qty]", desc: "Feed 🥕 carrots (or `golden-carrot`) for XP." },
      { usage: "combine [code code code]", desc: `Combine ${COMBINE_COUNT} same-rarity cards for a chance at the next rarity (${Math.round(COMBINE_CHANCE.common * 100)}% from common, down to ${Math.round(COMBINE_CHANCE.mythic * 100)}% from mythic). On failure you keep the best one. No codes shows the odds.` },
      { usage: "combine auto [rarity]", desc: `Picks ${COMBINE_COUNT} spare duplicates for you (cheapest first, lowest rarity unless you name one) and asks before combining. Your best copy of each bunny and your deck are never used.` },
      { usage: "sell <code>", desc: `Sell a card to the shop for ${Math.round(CONFIG.npcSellRate * 100)}% of its value (asks first).` },
    ],
  },
  {
    key: "burrow", emoji: "🕳️", title: "Bunny Burrow (idle farm)", web: "/burrow",
    intro: `Bunnies in your burrow earn coins while you're away, up to ${CONFIG.burrowMaxHours}h. Higher rarity and level earn more.`,
    commands: [
      { usage: "burrow", desc: "See your burrow and coins ready to collect." },
      { usage: "burrow add <code>", desc: "Move a card in. It can't be traded or sold while inside." },
      { usage: "burrow remove <code>", desc: "Take a card out (collects its coins)." },
      { usage: "burrow collect", desc: "Collect everything." },
    ],
  },
  {
    key: "shop", emoji: "🛒", title: "Shop & items", web: "/profile",
    intro: "Buy carrots, clovers, burrow keys and Carrot Juice. Some items have a daily limit.",
    commands: [
      { usage: "shop", desc: "Items, prices and today's limits." },
      { usage: "buy <item> [qty]", desc: "Buy an item, e.g. `buy carrot 5`." },
      { usage: "inv", desc: "Your items.", aliases: ["i", "inventory"] },
      { usage: "use <item>", desc: "Use `clover`, `juice` or `burrow-key`." },
    ],
  },
  {
    key: "battle", emoji: "⚔️", title: "Battles",
    intro: `Teams of ${CONFIG.teamSize}, one card per lane. Element advantage gives +25%. Traits: ${Object.values(TRAITS).map((t) => `${t.name} ${t.desc}`).join("; ")}. Team bonus: 2 of an element +5%, 3 +12%, 3 from one set +8%. Variants add up to +16%. Winner gets ${CONFIG.battleWinCoins} coins, loser ${CONFIG.battleLossCoins}, and deck cards gain XP.`,
    commands: [
      { usage: "deck [codes…]", desc: `Show or set your ${CONFIG.teamSize}-card deck in lane order.` },
      { usage: "battle @user", desc: "Challenge a player. They press Accept.", aliases: ["b"] },
      { usage: "battle random", desc: `Scout a random player's deck first, then fight (⚡${c.battle}), find another, or edit your deck.` },
      { usage: "tower", desc: `🏰 Meadow Tower: ${CONFIG.towerMaxFloor} PvE floors that get harder. Coins every floor, shards every 5th (⚡${c.battle}).`, aliases: ["tw"] },
    ],
  },
  {
    key: "trade", emoji: "🤝", title: "Trading", web: "/trades",
    intro: "Swap cards and coins safely. Nothing moves until both players confirm, and any change resets both confirmations.",
    commands: [
      { usage: "trade @user", desc: "Open a trade. Then use the buttons, or the commands below.", aliases: ["t"] },
      { usage: "trade add <code>", desc: "Put a card in your offer." },
      { usage: "trade remove <code>", desc: "Take a card out of your offer." },
      { usage: "trade coins <amount>", desc: "Set the coins in your offer." },
      { usage: "trade confirm", desc: "Confirm. The trade completes when both confirm." },
      { usage: "trade cancel", desc: "Cancel and get your cards back." },
    ],
  },
  {
    key: "market", emoji: "🏪", title: "Market", web: "/market",
    intro: `Sell cards at a fixed price. The seller pays a ${Math.round(CONFIG.marketFee * 100)}% fee. Listings expire after ${CONFIG.listingTtlMs / 3_600_000}h.`,
    commands: [
      { usage: "market [card name]", desc: "Cheapest listings, optionally for one card.", aliases: ["m"] },
      { usage: "market mine", desc: "Your listings." },
      { usage: "market sell <code> <price>", desc: "List a card." },
      { usage: "market buy <id>", desc: "Buy a listing." },
      { usage: "market cancel <id>", desc: "Take your listing down." },
    ],
  },
  {
    key: "auction", emoji: "🔨", title: "Auctions", web: "/auctions",
    intro: `Bids are held until you're outbid, then refunded. Each bid must beat the last by ${Math.round(CONFIG.auctionMinIncrement * 100)}%. A late bid extends the auction.`,
    commands: [
      { usage: "auction", desc: "Auctions ending soonest.", aliases: ["a", "auc"] },
      { usage: "auction mine", desc: "Your auctions." },
      { usage: "auction start <code> <minBid> <time> [buyout]", desc: "Start one. Time like `30m`, `6h`, `2d`." },
      { usage: "auction bid <id> <amount>", desc: "Place a bid. Bidding the buyout ends it now." },
      { usage: "auction view <id>", desc: "Details with Bid / Buyout buttons." },
      { usage: "auction cancel <id>", desc: "Cancel your auction (only before any bids)." },
    ],
  },
  {
    key: "lb", emoji: "🏆", title: "Leaderboards", web: "/leaderboard",
    intro: "See who's on top.",
    commands: [{ usage: "lb [coins|level|collection] [server]", desc: "Top 10 players, worldwide or just in this server.", aliases: ["top", "leaderboard"] }],
  },
];

/** Finds a section by key, title word, command name or alias (e.g. "auction", "feed", "h"). */
export function findGuide(query: string) {
  const q = query.trim().toLowerCase().replace(new RegExp(`^${CONFIG.prefix}\\s+`), "");
  if (!q) return undefined;
  const name = q.split(/\s+/)[0];
  return (
    GUIDE.find((s) => s.key === q || s.title.toLowerCase() === q) ??
    GUIDE.find((s) => s.commands.some((cmd) => cmd.usage.split(" ")[0] === name || cmd.aliases?.includes(name)))
  );
}
