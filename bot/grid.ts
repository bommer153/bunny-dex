import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AttachmentBuilder } from "discord.js";
import { CARDS, RARITIES, getCard, type CardDef, type Element, type Rarity } from "../game/data/cards";
import { TRAITS, variantInfo } from "../game/config";
import { RARITY_COLOR, cardPics, picKey } from "./ui";

// The server has no fonts installed (badge text came out as □ boxes): use the bot's own. Set before the first text is drawn.
process.env.FONTCONFIG_FILE ??= path.join(process.cwd(), "bot", "fonts", "fonts.conf");

const TILE = 180;
const PAD = 20; // room for the rarity glow between tiles
const COLS = 5;
const ART = TILE - 12;
const FRAMES = 12;
const DELAY = 100; // ms per frame: a 1.2 s loop
const GIF_SCALE = 0.6; // GIF encoding is the slow part; Discord shows embed images ~400-500 px wide anyway
const CARD_SCALE = { png: 2.5, gif: 2 }; // card pictures: 550 px, 440 px when animated (GIF size grows fast)
const thumbs = new Map<string, Buffer>(); // grid-size art per card, reused across requests (54 cards × ~20 KB)

/** The card art scaled to cover w×h (center crop). */
async function thumb(slug: string, w: number, h: number) {
  const grid = w === ART && h === ART; // only the grid size repeats; card pictures are drawn once
  const cached = grid ? thumbs.get(slug) : undefined;
  if (cached) return cached;
  const t = await sharp(path.join(process.cwd(), "public", "cards", `${slug}.png`)).resize(w, h).png().toBuffer();
  if (grid) thumbs.set(slug, t);
  return t;
}

/**
 * A card on the page: a square tile with its level in the corner, or with `card` set (card pictures) a portrait
 * trading card: name + element icon, art window with a round rarity badge, info strip, trait/ability/flavor text, stats.
 */
type Tile = { slug: string; level?: number; card?: boolean; variant?: string };
const CARD_H = 252; // portrait tile height (5:7 like a trading card)
/** Where a tile's art goes (tile units): the square grid art, or the trading card's landscape window. */
const artBox = (c: Tile, i: number) => {
  const [x, y] = at(i);
  return c.card ? { x: x + 12, y: y + 34, w: 156, h: 112 } : { x: x + 6, y: y + 6, w: ART, h: ART };
};
const ELEMENT_COLOR: Record<Element, string> = {
  fire: "#fb923c", water: "#38bdf8", nature: "#4ade80", electric: "#facc15", ice: "#a5f3fc", shadow: "#a78bfa", light: "#fde68a",
};
/** Element glyphs drawn around (0,0) within ±6, for the round element icon (no emoji font on the server). */
const ELEMENT_ICON: Record<Element, string> = {
  fire: `<path d="M0-6.5C3.5-2.5 5.5 0 4.5 3.2 3.6 6.2-3.6 6.2-4.5 3.2-5.3.5-3-1-2-3.2-1 0 0 .3.4-1.5Z"/>`,
  water: `<path d="M0-6.5C3-2.5 5 .5 5 2.8A5 5 0 0 1-5 2.8C-5 .5-3-2.5 0-6.5Z"/>`,
  nature: `<path d="M-5.5 5.5C-6-2 .5-6 6-6 6.5 1.5 1 6-5.5 5.5Z"/><path d="M-5.5 5.5 2.5-2.5" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" fill="none"/>`,
  electric: `<path d="M1.5-7-4.5 1H0L-1.5 7 4.5-1H0Z"/>`,
  ice: `<path d="M0-6.5V6.5M-5.6-3.25 5.6 3.25M-5.6 3.25 5.6-3.25" stroke="#1e1030" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  shadow: `<path d="M1.5-6.3A6.5 6.5 0 1 0 6.3 1.5 5 5 0 1 1 1.5-6.3Z"/>`,
  light: `<circle r="3"/><path d="M0-6.5V-4.8M0 4.8V6.5M-6.5 0H-4.8M4.8 0H6.5M-4.6-4.6-3.4-3.4M3.4 3.4 4.6 4.6M-4.6 4.6-3.4 3.4M3.4-3.4 4.6-4.6" stroke="#1e1030" stroke-width="1.6" stroke-linecap="round"/>`,
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Word-wraps to lines of at most `max` characters (SVG text doesn't wrap). */
const wrap = (s: string, max: number) =>
  s.split(" ").reduce<string[]>((ls, w) => (ls.length && (ls[ls.length - 1] + " " + w).length <= max ? [...ls.slice(0, -1), ls[ls.length - 1] + " " + w] : [...ls, w]), []);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const T = `font-family="Geist, sans-serif"`;

/**
 * The trading-card face (tile units, origin x,y) as layers under and over the art: element-tinted body, name and
 * round element icon, art window, info strip, trait/ability rows, flavor text (when it fits) and base stats.
 */
function cardFace(def: CardDef, x: number, y: number, a: ReturnType<typeof artBox>, stroke: string, rarity: Rarity) {
  const el = def.element, ec = ELEMENT_COLOR[el];
  const trait = TRAITS[el], traitName = trait.name.split(" ").slice(1).join(" "); // drop the emoji: no emoji font
  const text: string[] = [];
  let ty = y + 166;
  const row = (name: string, desc: string) => {
    text.push(`<text x="${x + 14}" y="${ty}" ${T} font-size="10" font-weight="bold" fill="#fff">${esc(name)}</text>`);
    for (const l of wrap(desc, 40)) text.push(`<text x="${x + 14}" y="${(ty += 10)}" ${T} font-size="8" fill="#e9defc">${esc(l)}</text>`);
    ty += 13;
  };
  row(`${traitName} · trait`, cap(trait.desc));
  for (const ab of def.abilities ?? []) row(ab.name, ab.description);
  // Flavor text sits just above the stats; the embed repeats the description, so it gives way when an ability needs the room.
  const flavor = wrap(def.description, 46).slice(0, 2), fy = y + 222 - (flavor.length - 1) * 8.5;
  if (ty - 4 <= fy - 10) {
    text.push(`<path d="M${x + 24} ${fy - 10}H${x + 156}" stroke="#fff" stroke-opacity=".15"/>`);
    flavor.forEach((l, k) => text.push(`<text x="${x + 90}" y="${fy + k * 8.5}" ${T} font-size="7" fill="#c4b5fd" text-anchor="middle">${esc(l)}</text>`));
  }
  const stat = (k: number, label: string, v: number) =>
    `<text x="${x + 40 + k * 52}" y="${y + 240.5}" ${T} font-size="7" font-weight="bold" fill="#a78bfa" text-anchor="end">${label}</text><text x="${x + 43 + k * 52}" y="${y + 241}" ${T} font-size="10" font-weight="bold" fill="#fff">${v}</text>`;
  // Background: element color at the top fading into the rarity color at the bottom, over the dark card base.
  const rc = hex(RARITY_COLOR[rarity]);
  const under = `<linearGradient id="bg-${def.slug}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ec}" stop-opacity=".55"/><stop offset=".5" stop-color="${ec}" stop-opacity=".08"/><stop offset=".55" stop-color="${rc}" stop-opacity=".08"/><stop offset="1" stop-color="${rc}" stop-opacity=".45"/></linearGradient>
    <rect x="${x + 6}" y="${y + 6}" width="${TILE - 12}" height="${CARD_H - 12}" rx="10" fill="#1a0d2e"/>
    <rect x="${x + 6}" y="${y + 6}" width="${TILE - 12}" height="${CARD_H - 12}" rx="10" fill="url(#bg-${def.slug})"/>`;
  const over = `<rect x="${a.x + 0.5}" y="${a.y + 0.5}" width="${a.w - 1}" height="${a.h - 1}" rx="3" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/>
    <text x="${x + 13}" y="${y + 25}" ${T} font-size="${Math.min(14, 108 / (def.name.length * 0.6)).toFixed(1)}" font-weight="bold" fill="#fff">${esc(def.name)}</text>
    <g transform="translate(${x + 134} ${y + 20})"><circle r="10.5" fill="#1e1030" stroke="${stroke}" stroke-width="1"/><image href="${badgeHref(rarity)}" x="-8.5" y="-8.5" width="17" height="17"/></g>
    <g transform="translate(${x + 158} ${y + 20})"><circle r="10.5" fill="${ec}" stroke="#fff" stroke-width="1"/><g fill="#1e1030">${ELEMENT_ICON[el]}</g></g>
    ${text.join("")}
    <rect x="${x + 10}" y="${y + 229}" width="${TILE - 20}" height="16" rx="8" fill="#000" fill-opacity=".3"/>
    ${stat(0, "ATK", def.atk)}${stat(1, "DEF", def.def)}${stat(2, "HP", def.hp)}`;
  return { under, over };
}
const badges = new Map<Rarity, string>(); // the rarity emoji PNGs (public/emojis) as data URIs for the SVG
const badgeHref = (r: Rarity) => {
  if (!badges.has(r)) badges.set(r, `data:image/png;base64,${readFileSync(path.join(process.cwd(), "public", "emojis", `bunnydex_rarity_${r}.png`)).toString("base64")}`);
  return badges.get(r)!;
};
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;
const at = (i: number) => [PAD + (i % COLS) * (TILE + PAD), PAD + Math.floor(i / COLS) * (TILE + PAD)] as const;

const HOLO = ["#f87171", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#f0abfc", "#f87171"].map((c, k, a) => `<stop offset="${k / (a.length - 1)}" stop-color="${c}"/>`).join("");
const DEFS = `<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".4" stop-color="#fff" stop-opacity=".06"/><stop offset=".41" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="spark"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">${HOLO}</linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#d97706"/><stop offset="1" stop-color="#fde68a"/></linearGradient>
  <linearGradient id="velvet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#3b0764"/></linearGradient>
  <radialGradient id="vig"><stop offset=".45" stop-color="#0b0118" stop-opacity="0"/><stop offset="1" stop-color="#0b0118" stop-opacity=".85"/></radialGradient>`;

/** Variant looks: a tint over the art, a layer on the card body (card pictures only) and the color of the variant's chip. */
type Box = { x: number; y: number; w: number; h: number };
const box = (b: Box, attrs: string, rx = 0) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" ${attrs}/>`;
const STARS = Array.from({ length: 30 }, (_, k) => [((k * 37) % 160) + 4, ((k * 61) % 232) + 4, k % 3 ? 0.6 : 1.2]); // fixed starfield, body units
const VARIANT_LOOK: Record<string, { color: string; art?: (a: Box) => string; body?: (b: Box) => string }> = {
  foil: { color: "#7dd3fc", art: (a) => box(a, `fill="url(#holo)" opacity=".28"`) },
  golden: { color: "#fbbf24", art: (a) => box(a, `fill="#f59e0b" opacity=".22"`), body: (b) => box(b, `fill="url(#gold)" opacity=".4"`, 10) },
  shadow: { color: "#c084fc", art: (a) => box(a, `fill="url(#vig)"`), body: (b) => box(b, `fill="#05010d" opacity=".5"`, 10) },
  crystal: {
    color: "#a5f3fc",
    art: (a) => `${box(a, `fill="#cffafe" opacity=".22"`)}<path d="M${a.x} ${a.y}H${a.x + a.w * 0.45}L${a.x} ${a.y + a.h * 0.5}ZM${a.x + a.w} ${a.y + a.h}H${a.x + a.w * 0.5}L${a.x + a.w} ${a.y + a.h * 0.35}Z" fill="#fff" opacity=".35"/>`,
    body: (b) => box(b, `fill="#a5f3fc" opacity=".3"`, 10),
  },
  rainbow: { color: "url(#holo)", art: (a) => box(a, `fill="url(#holo)" opacity=".16"`), body: (b) => box(b, `fill="url(#holo)" opacity=".32"`, 10) },
  celestial: {
    color: "#c4b5fd",
    art: (a) => box(a, `fill="#6366f1" opacity=".14"`),
    body: (b) => box(b, `fill="#1e1b4b" opacity=".5"`, 10) + STARS.map(([sx, sy, r]) => `<circle cx="${b.x + sx}" cy="${b.y + sy}" r="${r}" fill="#fff" opacity=".75"/>`).join(""),
  },
  royal: { color: "#f0b12a", body: (b) => box(b, `fill="url(#velvet)" opacity=".55"`, 10) + box({ x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6 }, `fill="none" stroke="#f0b12a" stroke-width="1.2"`, 8) },
};
/** The variant's name on a chip in the art's top-left corner (bigger on the small grid tiles). */
function variantChip(code: string, a: Box, k: number) {
  const look = VARIANT_LOOK[code];
  if (!look) return "";
  const name = variantInfo(code).name.toUpperCase(), w = (name.length * 5.4 + 10) * k, h = 11 * k;
  return `<rect x="${a.x + 4}" y="${a.y + 4}" width="${w}" height="${h}" rx="${h / 2}" fill="#1e1030" fill-opacity=".85" stroke="${look.color}" stroke-width="${0.9 * k}"/>
    <text x="${a.x + 4 + w / 2}" y="${a.y + 4 + h * 0.74}" ${T} font-size="${7 * k}" font-weight="bold" letter-spacing="${0.5 * k}" fill="${look.color}" text-anchor="middle">${name}</text>`;
}
const SPARKS = [[14, 16], [164, 26], [6, 104], [96, 5], [174, 80], [22, 170], [84, 176]]; // spots on the frame (tile coords), clear of the level badge
const star = (cx: number, cy: number, r: number, k = r * 0.22) =>
  `M${cx} ${cy - r}L${cx + k} ${cy - k}L${cx + r} ${cy}L${cx + k} ${cy + k}L${cx} ${cy + r}L${cx - k} ${cy + k}L${cx - r} ${cy}L${cx - k} ${cy - k}Z`;

/**
 * One frame of rarity effects (t = 0..1 through the loop) as SVG  under and over the card art.
 * Effects stack with rarity: rare glows, epic adds glass, legendary pulses with a shine sweep, mythic sparkles, secret gets a holo frame.
 */
function effects(list: Tile[], t: number, W: number, H: number, scale: number) {
  let defs = DEFS, under = "", over = "";
  list.forEach((c, i) => {
    const [x, y] = at(i), a = artBox(c, i), th = c.card ? CARD_H : TILE;
    const def = getCard(c.slug), rarity = def.rarity, rank = RANK[rarity];
    const p = (t + i * 0.17) % 1; // per-card offset so the page doesn't move in lockstep
    const wave = rank >= RANK.legendary ? 0.5 + 0.5 * Math.sin(p * 2 * Math.PI) : 0.5;
    let stroke = hex(RARITY_COLOR[rarity]);
    if (rarity === "secret") {
      defs += `<linearGradient id="h${i}" gradientUnits="userSpaceOnUse" x1="${x}" y1="${y}" x2="${x + TILE}" y2="${y + th}" gradientTransform="rotate(${t * 360} ${x + TILE / 2} ${y + th / 2})">${HOLO}</linearGradient>`;
      stroke = `url(#h${i})`;
    }
    if (rank >= RANK.rare) under += `<rect x="${x + 4}" y="${y + 4}" width="${TILE - 8}" height="${th - 8}" rx="14" fill="none" stroke="${stroke}" stroke-width="${rank * 3 + wave * 8}" opacity="${0.3 + rank * 0.08 + wave * 0.2}" filter="url(#blur)"/>`;
    const face = c.card ? cardFace(def, x, y, a, stroke, rarity) : null;
    const look = c.variant ? VARIANT_LOOK[c.variant] : undefined;
    if (face) under += face.under + (look?.body?.({ x: x + 6, y: y + 6, w: TILE - 12, h: th - 12 }) ?? "");
    if (look?.art) over += look.art(a);
    if (rank >= RANK.epic) {
      // Glass: a gloss over the art and a bright inner edge; legendary+ also gets a light sweep across it.
      const sweep = a.x - 90 + p * 1.8 * (a.w + 140);
      defs += `<clipPath id="c${i}"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="${c.card ? 3 : 10}"/></clipPath>`;
      over += `<g clip-path="url(#c${i})"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="url(#glass)"/>${rank >= RANK.legendary ? `<rect x="${sweep}" y="${a.y - 40}" width="44" height="${a.h + 80}" fill="url(#shine)" transform="rotate(20 ${sweep + 22} ${a.y + a.h / 2})"/>` : ""}</g>`;
      if (!c.card) over += `<rect x="${a.x + 2}" y="${a.y + 2}" width="${a.w - 4}" height="${a.h - 4}" rx="9" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>`;
    }
    if (face) {
      // Every card is glassy: a soft diagonal gloss over the whole face and a bright inner rim.
      over += `${face.over}<rect x="${x + 6}" y="${y + 6}" width="${TILE - 12}" height="${th - 12}" rx="10" fill="url(#glass)" opacity=".55"/>
        <rect x="${x + 7.5}" y="${y + 7.5}" width="${TILE - 15}" height="${th - 15}" rx="9" fill="none" stroke="#fff" stroke-opacity=".3"/>`;
    }
    if (c.variant) over += variantChip(c.variant, a, c.card ? 1 : 1.7);
    // Grid tiles: a thick frame. Card pictures: a thin ring like the web's card tiles (ring-2, rounded-xl).
    over += c.card
      ? `<rect x="${x + 5}" y="${y + 5}" width="${TILE - 10}" height="${th - 10}" rx="11" fill="none" stroke="${stroke}" stroke-width="2"/>`
      : `<rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="${th - 6}" rx="14" fill="none" stroke="${stroke}" stroke-width="6"/>`;
    if (rank >= RANK.mythic) {
      const n = rarity === "secret" ? 7 : 4;
      for (let k = 0; k < n; k++) {
        const v = Math.sin((t * 2 + k / n) * 2 * Math.PI); // each twinkles twice per loop
        if (v <= 0) continue;
        const [sx, sy] = [x + SPARKS[k][0], y + (SPARKS[k][1] * th) / TILE]; // stretched to stay on a portrait frame
        over += `<circle cx="${sx}" cy="${sy}" r="${6 + v * 8}" fill="url(#spark)" opacity="${v}"/><path d="${star(sx, sy, 3 + v * 8)}" fill="#fff" opacity="${v}"/>`;
      }
    }
    // Level badge last so sparkles never cover it (card pictures show stats instead).
    if (!c.card) over += `<rect x="${x + TILE - 62}" y="${y + TILE - 34}" width="54" height="26" rx="8" fill="#1e1030" stroke="${stroke}" stroke-width="2"/>
      <text x="${x + TILE - 35}" y="${y + TILE - 15}" font-family="Geist, sans-serif" font-size="15" font-weight="bold" fill="#fff" text-anchor="middle">Lv ${c.level}</text>`;
  });
  const svg = (body: string) => Buffer.from(`<svg width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`);
  return { under: svg(under), over: svg(over) };
}

/**
 * Tiles (laid out in a W×H tile-unit page) in rarity-colored frames with badges and rarity effects.
 * A looping GIF if any card is legendary+, otherwise a PNG, each drawn at its scale.
 */
async function render(list: Tile[], W: number, H: number, scale: { png: number; gif: number }) {
  const animated = list.some((c) => RANK[getCard(c.slug).rarity] >= RANK.legendary);
  const s = animated ? scale.gif : scale.png, w = Math.round(W * s), h = Math.round(H * s), up = Math.ceil(s);
  // The art goes on its own layer once (at a whole-number scale so tiles land on exact pixels); every frame reuses it between its effect layers.
  const tiles = await sharp({ create: { width: W * up, height: H * up, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(await Promise.all(list.map(async (c, i) => {
      const a = artBox(c, i);
      return { input: await thumb(c.slug, a.w * up, a.h * up), left: a.x * up, top: a.y * up };
    })))
    .raw().toBuffer();
  const art = await sharp(tiles, { raw: { width: W * up, height: H * up, channels: 4 } }).resize(w, h).png().toBuffer();
  const frame = (t: number) => {
    const fx = effects(list, t, W, H, s);
    return sharp({ create: { width: w, height: h, channels: 4, background: "#140a22" } }).composite([{ input: fx.under }, { input: art }, { input: fx.over }]);
  };
  if (!animated) return { ext: "png", data: await frame(0).png().toBuffer() };
  const frames = await Promise.all(Array.from({ length: FRAMES }, (_, f) => frame(f / FRAMES).raw().toBuffer()));
  // effort 1 + light dither: ~10× faster than the defaults with no visible loss at this size.
  const gif = await sharp(Buffer.concat(frames), { raw: { width: w, height: h * FRAMES, channels: 4, pageHeight: h } })
    .gif({ delay: Array(FRAMES).fill(DELAY), loop: 0, effort: 1, dither: 0.5, interFrameMaxError: 6 })
    .toBuffer();
  return { ext: "gif", data: gif };
}

/** One picture of a collection page (level badges). null if rendering fails (the text list still works). */
export async function collectionGrid(list: Tile[]): Promise<AttachmentBuilder | null> {
  if (!list.length) return null;
  try {
    const { ext, data } = await render(list, COLS * (TILE + PAD) + PAD, Math.ceil(list.length / COLS) * (TILE + PAD) + PAD, { png: 1, gif: GIF_SCALE });
    return new AttachmentBuilder(data, { name: `collection.${ext}` });
  } catch (e) {
    console.error("collection grid failed", e);
    return null;
  }
}

const drawing = new Map<string, Promise<void>>(); // pictures being drawn right now, so two requests share one render
const variantPics: string[] = []; // drawn variant pictures, oldest first

/**
 * Makes sure the card picture (a portrait trading card with its rarity and variant effects) is in cardPics. Normal ones
 * are drawn at startup; a variant is drawn the first time it's shown (~0.1 s, ~1 s for an animated one). Never throws:
 * on failure cardFile falls back to the normal picture.
 */
export function drawCard(slug: string, variant = "normal"): Promise<void> {
  const key = picKey(slug, variant);
  if (cardPics.has(key)) return Promise.resolve();
  let p = drawing.get(key);
  if (!p) {
    p = render([{ slug, card: true, variant }], TILE + 2 * PAD, CARD_H + 2 * PAD, CARD_SCALE)
      .then(({ ext, data }) => {
        cardPics.set(key, { name: `${key}.${ext}`, data });
        // shortcut: keeps the 60 newest variant pictures (~25 MB); raise it if players keep waiting on redraws.
        if (variant !== "normal" && variantPics.push(key) > 60) cardPics.delete(variantPics.shift()!);
      })
      .catch((e) => console.error("card picture failed", key, e))
      .finally(() => drawing.delete(key));
    drawing.set(key, p);
  }
  return p;
}

/** Draws every card's normal picture once, at startup. */
export async function warmCards() {
  const start = Date.now();
  for (const c of CARDS) await drawCard(c.slug);
  return { count: cardPics.size, ms: Date.now() - start };
}
