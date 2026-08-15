export type WikiCommand = {
  cmd: string;
  desc: string;
};

export const WIKI_NAV = [
  { href: "/wiki", label: "Overview" },
  { href: "/wiki/getting-started", label: "Getting started" },
  { href: "/wiki/commands", label: "Commands" },
  { href: "/wiki/bunnies", label: "Bunnies & cards" },
  { href: "/wiki/economy", label: "Economy" },
  { href: "/wiki/battle", label: "Deck & battle" },
  { href: "/wiki/social", label: "Trade & market" },
] as const;

export const COMMAND_GROUPS: Array<{ title: string; commands: WikiCommand[] }> = [
  {
    title: "Core",
    commands: [
      { cmd: "bd help", desc: "Show command help." },
      { cmd: "bd start", desc: "Create your account and claim starter bunnies + coins." },
      { cmd: "bd profile [@user]", desc: "View level, XP, coins, rating, and stats." },
      { cmd: "bd bal", desc: "Show coins, gems, and tickets." },
      { cmd: "bd daily", desc: "Claim your daily coin reward." },
      { cmd: "bd work", desc: "Earn a small coin payout on cooldown." },
    ],
  },
  {
    title: "Hunt & collection",
    commands: [
      { cmd: "bd hunt", desc: "Primary loop — roll loot for cards, coins, or items." },
      { cmd: "bd cards", desc: "List your owned card instances." },
      { cmd: "bd card <name>", desc: "Look up a card in the global catalog." },
      { cmd: "bd collection", desc: "Set completion and rarity progress." },
      { cmd: "bd inv", desc: "View inventory items." },
      { cmd: "bd use <item>", desc: "Activate a booster or consumable." },
      { cmd: "bd open <box>", desc: "Open a loot box." },
      { cmd: "bd pack", desc: "List available packs." },
      { cmd: "bd pack open <slug>", desc: "Buy and open a pack (e.g. standard, fire)." },
    ],
  },
  {
    title: "Shop & gambling",
    commands: [
      { cmd: "bd shop [category]", desc: "Browse shop offers." },
      { cmd: "bd buy <sku> [qty]", desc: "Purchase a shop SKU." },
      { cmd: "bd sell card <userCardId>", desc: "Sell a card to the NPC sink." },
      { cmd: "bd flip <amount> <heads|tails>", desc: "Coin flip wager (in-game coins only)." },
      { cmd: "bd slots <amount>", desc: "Slots wager." },
      { cmd: "bd dice <amount> <1-6>", desc: "Dice wager." },
    ],
  },
  {
    title: "Deck & battle",
    commands: [
      { cmd: "bd deck", desc: "List your decks." },
      { cmd: "bd deck create <name>", desc: "Create a new deck." },
      { cmd: "bd deck add <name> <userCardId>", desc: "Add a card instance to a deck." },
      { cmd: "bd deck remove <name> <userCardId>", desc: "Remove a card from a deck." },
      { cmd: "bd deck use <name>", desc: "Set your active battle deck (must be valid)." },
      { cmd: "bd deck view <name>", desc: "Inspect a deck." },
      { cmd: "bd battle random", desc: "Queue for rating-based matchmaking." },
      { cmd: "bd battle @user", desc: "Challenge another player." },
      { cmd: "bd battle history", desc: "Recent battle results." },
    ],
  },
  {
    title: "Social economy",
    commands: [
      { cmd: "bd trade @user", desc: "Open a direct trade." },
      { cmd: "bd trade add <userCardId>", desc: "Add a card to your trade offer." },
      { cmd: "bd trade coins <amount>", desc: "Set coins on your offer." },
      { cmd: "bd trade confirm", desc: "Confirm; settles when both confirm." },
      { cmd: "bd trade cancel", desc: "Cancel and unlock assets." },
      { cmd: "bd market", desc: "Browse marketplace listings." },
      { cmd: "bd market search <query>", desc: "Search listings." },
      { cmd: "bd market sell <userCardId> <price>", desc: "List a card (locks it)." },
      { cmd: "bd market buy <listingId>", desc: "Buy a listing." },
      { cmd: "bd market cancel <listingId>", desc: "Cancel your listing." },
      { cmd: "bd market mine", desc: "Your active listings." },
    ],
  },
  {
    title: "Progression",
    commands: [
      { cmd: "bd quests", desc: "Daily quests and progress." },
      { cmd: "bd quests claim <slug>", desc: "Claim a completed quest." },
      { cmd: "bd achievements", desc: "Achievement list." },
      { cmd: "bd leaderboard <kind>", desc: "wealth | collection | rating | wins | achievements." },
      { cmd: "bd favorite <userCardId>", desc: "Set profile favorite card." },
    ],
  },
];

export const ELEMENTS = [
  { id: "fire", beats: "nature", note: "Aggressive scorched hoppers" },
  { id: "water", beats: "fire", note: "Tide and current bunnies" },
  { id: "nature", beats: "water", note: "Meadow starters and guards" },
  { id: "electric", beats: "ice", note: "Static spark fluff" },
  { id: "ice", beats: "shadow", note: "Frost and glacier gliders" },
  { id: "shadow", beats: "light", note: "Nightveil umbra hoppers" },
  { id: "light", beats: "electric", note: "Dawn and prism patrons" },
] as const;

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "secret",
] as const;

export const VARIANTS = [
  { id: "normal", note: "Standard print" },
  { id: "foil", note: "Shiny collectible" },
  { id: "golden", note: "Higher market value" },
  { id: "shadow", note: "Dark aesthetic variant" },
  { id: "crystal", note: "Rare sparkle finish" },
  { id: "rainbow", note: "Very scarce cosmetic" },
  { id: "celestial", note: "Ultra premium look" },
  { id: "royal", note: "Top collectibility tier" },
] as const;

export const SETS = [
  { id: "meadow", name: "Meadow Beginnings", blurb: "Starter flock and early explorers." },
  { id: "ember", name: "Ember Grove", blurb: "Fire and storm of the grove." },
  { id: "tide", name: "Tide Hollow", blurb: "Water and ice of the deep tide." },
  { id: "nightveil", name: "Nightveil", blurb: "Shadow and light legends." },
] as const;
