// Pure game math: no DB, no Discord. Everything here is unit-tested in rules.test.ts.
import { randomBytes } from "node:crypto";
import { teamBonus } from "./synergy";
import { CARDS, ELEMENTS, RARITIES, getCard, type CardDef, type Element, type Rarity } from "./data/cards";
import { BURROW_RATE, COMBINE_CHANCE, COMBINE_COUNT, CONFIG, ELEMENT_ADVANTAGE, LEVEL_CAP, QUESTS, RARITY_WEIGHT, VARIANTS, variantInfo, type Quest } from "./config";

export type Rng = () => number; // [0, 1)

function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rng: Rng): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

const RARE_PLUS = new Set<Rarity>(["rare", "epic", "legendary", "mythic", "secret"]);
export const isRarePlus = (r: Rarity) => RARE_PLUS.has(r);

/** Rarity for a hunt. Clover doubles rare+ weights; pity forces rare+. */
export function rollRarity(rng: Rng, opts: { clover?: boolean; pity?: boolean } = {}): Rarity {
  const pool = opts.pity ? RARITIES.filter(isRarePlus) : RARITIES;
  return weightedPick(pool, (r) => RARITY_WEIGHT[r] * (opts.clover && isRarePlus(r) ? 2 : 1), rng);
}

export function rollHunt(rng: Rng, opts: { clover?: boolean; pity?: boolean } = {}) {
  const rarity = rollRarity(rng, opts);
  const pool = CARDS.filter((c) => c.rarity === rarity);
  const card = pool[Math.floor(rng() * pool.length)];
  return { card, variant: rollVariant(rng) };
}

export const rollVariant = (rng: Rng): string => weightedPick(VARIANTS, (v) => v.weight, rng).code;

export const nextRarity = (r: Rarity): Rarity | undefined => RARITIES[RARITIES.indexOf(r) + 1];

/** Combine roll: success gives a random card of the next rarity. */
export function rollCombine(rarity: Rarity, rng: Rng) {
  const up = nextRarity(rarity);
  if (!up || rng() >= COMBINE_CHANCE[rarity]) return { success: false as const };
  const pool = CARDS.filter((c) => c.rarity === up);
  return { success: true as const, card: pool[Math.floor(rng() * pool.length)] };
}

// ---- Player level: level L needs base * growth^(L-1) XP to reach L+1 ----
export const xpToNextPlayerLevel = (level: number) =>
  Math.floor(CONFIG.playerXpBase * Math.pow(CONFIG.playerXpGrowth, level - 1));

/** Total XP → { level, into (xp into current level), need (xp for next level) } */
export function playerLevel(totalXp: number) {
  let level = 1;
  let rest = totalXp;
  while (rest >= xpToNextPlayerLevel(level)) {
    rest -= xpToNextPlayerLevel(level);
    level++;
  }
  return { level, into: rest, need: xpToNextPlayerLevel(level) };
}

// ---- Energy ----
export const maxEnergy = (level: number) => Math.min(CONFIG.energyBase + CONFIG.energyPerLevel * (level - 1), CONFIG.energyCap);

/**
 * Current energy from the stored value + time passed.
 * Returns the new anchor time to store, keeping partial progress toward the next point.
 * Missing stored value = a full bar. Above max (from juice) doesn't regen.
 */
export function energyNow(stored: number | null | undefined, at: Date | null | undefined, max: number, now: Date) {
  if (stored == null || at == null) return { energy: max, anchor: now, nextInMs: 0 };
  if (stored >= max) return { energy: stored, anchor: now, nextInMs: 0 };
  const ticks = Math.floor(Math.max(0, now.getTime() - at.getTime()) / CONFIG.energyRegenMs);
  const energy = Math.min(max, stored + ticks);
  const anchor = energy >= max ? now : new Date(at.getTime() + ticks * CONFIG.energyRegenMs);
  const nextInMs = energy >= max ? 0 : anchor.getTime() + CONFIG.energyRegenMs - now.getTime();
  return { energy, anchor, nextInMs };
}

/** Time until `need` energy is available. */
export const energyWaitMs = (e: { energy: number; nextInMs: number }, need: number) =>
  e.energy >= need ? 0 : e.nextInMs + (need - e.energy - 1) * CONFIG.energyRegenMs;

// ---- Shop day ----
/** Calendar day ("YYYY-MM-DD") in the shop's time zone, used to reset daily buy limits. */
export const shopDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.shopTimeZone }).format(now);

/** Time until the shop day rolls over (next local midnight). */
export function msUntilShopReset(now: Date) {
  const today = shopDay(now);
  let lo = now.getTime(), hi = lo + 26 * 3_600_000; // binary search: robust to any offset/DST
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (shopDay(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi - now.getTime();
}

// ---- Card level ----
export const xpToNextCardLevel = (level: number) => 50 * level;

/** Adds XP to a card, stopping at its rarity's level cap. */
export function applyCardXp(card: { level: number; xp: number }, rarity: Rarity, gained: number) {
  const cap = LEVEL_CAP[rarity];
  let { level, xp } = card;
  xp += gained;
  while (level < cap && xp >= xpToNextCardLevel(level)) {
    xp -= xpToNextCardLevel(level);
    level++;
  }
  if (level >= cap) xp = 0;
  return { level, xp, capped: level >= cap };
}

export const levelMult = (level: number) => 1 + 0.05 * (level - 1);

export function cardStats(def: CardDef, level: number) {
  const m = levelMult(level);
  return { atk: Math.round(def.atk * m), def: Math.round(def.def * m), hp: Math.round(def.hp * m) };
}

/** Coin value used for NPC selling and as a price hint. */
export const cardValue = (def: CardDef, variant: string, level: number) =>
  Math.round(def.baseValue * variantInfo(variant).mult * (1 + 0.1 * (level - 1)));

type Owned = { slug: string; variant: string; level: number };
/** Cards safe to auto-combine, cheapest first: never your best copy of a bunny (so the dex keeps it), never secret. */
export function spareCards<T extends Owned>(cards: T[]): T[] {
  const v = (c: T) => cardValue(getCard(c.slug), c.variant, c.level);
  const best = new Map<string, T>();
  for (const c of cards) if (!best.has(c.slug) || v(c) > v(best.get(c.slug)!)) best.set(c.slug, c);
  return cards.filter((c) => best.get(c.slug) !== c && nextRarity(getCard(c.slug).rarity)).sort((a, b) => v(a) - v(b));
}

/** Auto combine: COMBINE_COUNT spare cards of one rarity (default: the lowest rarity that has enough), or null. */
export function autoPick<T extends Owned>(cards: T[], rarity?: Rarity): T[] | null {
  const spare = spareCards(cards);
  const of = (r: Rarity) => spare.filter((c) => getCard(c.slug).rarity === r);
  const r = rarity ?? RARITIES.find((x) => of(x).length >= COMBINE_COUNT);
  const picks = r ? of(r).slice(0, COMBINE_COUNT) : [];
  return picks.length === COMBINE_COUNT ? picks : null;
}

/** XP a card gives when fed to another card. */
export const feedXp = (def: CardDef, variant: string, level: number) =>
  Math.round(def.baseValue * variantInfo(variant).mult * 0.5) + (level - 1) * 20;

// ---- Burrow ----
export function burrowEarnings(def: CardDef, level: number, since: Date, now: Date) {
  const hours = Math.min(Math.max(0, now.getTime() - since.getTime()) / 3_600_000, CONFIG.burrowMaxHours);
  return Math.floor(BURROW_RATE[def.rarity] * levelMult(level) * hours);
}

export const burrowSlots = (playerLvl: number, extra: number) =>
  Math.min(CONFIG.burrowBaseSlots + Math.floor(playerLvl / CONFIG.burrowSlotsPerLevels) + extra, CONFIG.burrowMaxSlots);

export const auctionSlots = (playerLvl: number) =>
  CONFIG.auctionBaseSlots + Math.floor(playerLvl / CONFIG.auctionSlotsPerLevels);

// ---- Battle ----
export type Fighter = { def: CardDef; level: number; code: string; variant?: string };
const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;

/** One card's power in its lane: stats, element advantage, element trait, variant (+4% per variant step) and team bonus. */
export function lanePower(me: Fighter, foe: Fighter | undefined, lane = 0, teamMult = 1) {
  const s = cardStats(me.def, me.level);
  const el = me.def.element;
  let atk = s.atk * (el === "fire" ? 1.15 : 1) * (foe?.def.element === "ice" ? 0.85 : 1);
  if (el === "shadow" && foe && RARITY_RANK[foe.def.rarity] > RARITY_RANK[me.def.rarity]) atk *= 1.2;
  const def = s.def * (el === "nature" ? 1.15 : 1);
  const hp = s.hp * (el === "water" ? 1.3 : 1);
  const adv = foe && ELEMENT_ADVANTAGE[el] === foe.def.element ? 1.25 : 1;
  const surge = el === "electric" && lane === 0 ? 1.15 : 1;
  const variant = 1 + (variantInfo(me.variant ?? "normal").mult - 1) * 0.04;
  return (atk * 1.2 * adv + def + hp * 0.15) * surge * variant * teamMult;
}

export { teamBonus } from "./synergy";

/** Best-of-lanes auto battle. Empty lane loses. ±10% random swing per lane. */
export function resolveBattle(a: Fighter[], b: Fighter[], rng: Rng) {
  const lanes = [];
  let aWins = 0;
  let bWins = 0;
  const ta = teamBonus(a);
  const tb = teamBonus(b);
  for (let i = 0; i < CONFIG.teamSize; i++) {
    const pa = a[i] ? lanePower(a[i], b[i], i, ta.mult[i]) * (0.9 + rng() * 0.2) : 0;
    const pb = b[i] ? lanePower(b[i], a[i], i, tb.mult[i]) * (0.9 + rng() * 0.2) : 0;
    const winner = pa === pb ? null : pa > pb ? "a" : "b";
    if (winner === "a") aWins++;
    if (winner === "b") bWins++;
    lanes.push({ a: a[i], b: b[i], pa: Math.round(pa), pb: Math.round(pb), winner });
  }
  const winner = aWins === bWins ? null : aWins > bWins ? "a" : "b";
  return { lanes, winner, bonus: { a: ta.notes, b: tb.notes } } as const;
}

// ---- Auction ----
export const nextMinBid = (a: { topBid: number; minBid: number; bids: number }) =>
  a.bids === 0 ? a.minBid : Math.ceil(a.topBid * (1 + CONFIG.auctionMinIncrement));

/** New end time after a bid: a bid inside the last window extends the auction. */
export function antiSnipe(endsAt: Date, now: Date) {
  const left = endsAt.getTime() - now.getTime();
  return left < CONFIG.auctionAntiSnipeMs ? new Date(now.getTime() + CONFIG.auctionAntiSnipeMs) : endsAt;
}

/** "90s", "2m", "1h", "1d", "1h30m" → ms. Returns null if unparseable. */
export function parseDuration(text: string): number | null {
  const parts = [...text.toLowerCase().matchAll(/(\d+)\s*([smhd])/g)];
  if (!parts.length || parts.map((p) => p[0]).join("") !== text.toLowerCase().replace(/\s/g, "")) return null;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return parts.reduce((ms, p) => ms + Number(p[1]) * unit[p[2] as keyof typeof unit], 0);
}

export { formatDuration } from "./format";

/** Short id players type. 6 base36 chars ≈ 2 billion values; DB unique index catches the rare collision. */
export const makeCode = () => BigInt("0x" + randomBytes(5).toString("hex")).toString(36).slice(-6).padStart(6, "0");

// ---- Daily streak ----

/** Streak after a daily claim at `now`: +1 if the previous claim was recent enough, else it restarts at 1. */
export function nextStreak(last: Date | null | undefined, streak: number, now: Date) {
  return last && now.getTime() - last.getTime() <= CONFIG.streakGraceMs ? streak + 1 : 1;
}
/** Day 1–7 of the weekly reward cycle. Day 7 adds a guaranteed rare+ card. */
export const streakDay = (streak: number) => ((Math.max(1, streak) - 1) % 7) + 1;
/** Daily coins grow 25% per streak day: 250 on day 1, 625 on day 7. */
export const streakCoins = (streak: number) => Math.round(CONFIG.dailyCoins * (1 + 0.25 * (streakDay(streak) - 1)));

// ---- Quests ----

const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
/** The player's 3 daily quests: stable for the whole day, different per player and per day. */
export function dailyQuests(discordId: string, day: string): Quest[] {
  return [...QUESTS].sort((a, b) => hash(`${discordId}${day}${a.id}`) - hash(`${discordId}${day}${b.id}`)).slice(0, 3);
}
/** Monday ("YYYY-MM-DD") of the week containing `day` (a shopDay string). */
export function weekKey(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ---- Element sets ----

export const setTitle = (el: Element) => `${el[0].toUpperCase()}${el.slice(1)} Keeper`;
/** Elements the player owns every card of. */
export const completedSets = (owned: Set<string>) => ELEMENTS.filter((el) => CARDS.filter((c) => c.element === el).every((c) => owned.has(c.slug)));

// ---- Pacing ----

/** Hunt XP for `count` hunts when `doneToday` were already done: full up to the daily cap, half after. */
export function huntXp(doneToday: number, count: number) {
  const full = Math.max(0, Math.min(count, CONFIG.huntXpDailyCap - doneToday));
  return full * CONFIG.huntXp + Math.floor(((count - full) * CONFIG.huntXp) / 2);
}

// ---- Meadow Tower (PvE) ----

/** Fixed enemy team for a floor: 5 floors per rarity tier (mythic from floor 26), levels rise with the floor. */
export function towerTeam(floor: number): Fighter[] {
  const tier = RARITIES[Math.min(5, Math.floor((floor - 1) / 5))];
  const pool = CARDS.filter((c) => c.rarity === tier);
  const level = Math.min(LEVEL_CAP[tier], floor);
  return Array.from({ length: CONFIG.teamSize }, (_, i) => ({ def: pool[(floor * 7 + i * 3) % pool.length], level, code: `tower${floor}-${i}` }));
}
/** Coins every floor; shards every 5th floor. */
export const towerReward = (floor: number) => ({ coins: 40 * floor, shards: floor % 5 === 0 ? floor * 2 : 0 });
