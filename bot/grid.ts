import path from "node:path";
import sharp from "sharp";
import { AttachmentBuilder } from "discord.js";
import { CARDS, RARITIES, getCard, type Rarity } from "../game/data/cards";
import { RARITY_COLOR, cardPics } from "./ui";

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

async function thumb(slug: string, size: number) {
  const cached = size === ART ? thumbs.get(slug) : undefined; // only the grid size repeats; card pictures are drawn once
  if (cached) return cached;
  const t = await sharp(path.join(process.cwd(), "public", "cards", `${slug}.png`)).resize(size, size).png().toBuffer();
  if (size === ART) thumbs.set(slug, t);
  return t;
}

/** A card on the page. The badge shows its level, or `chip` (in the rarity color) when given. */
type Tile = { slug: string; level?: number; chip?: string };
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;
const at = (i: number) => [PAD + (i % COLS) * (TILE + PAD), PAD + Math.floor(i / COLS) * (TILE + PAD)] as const;

const DEFS = `<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".4" stop-color="#fff" stop-opacity=".06"/><stop offset=".41" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="spark"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
const HOLO = ["#f87171", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#f0abfc", "#f87171"].map((c, k, a) => `<stop offset="${k / (a.length - 1)}" stop-color="${c}"/>`).join("");
const SPARKS = [[14, 16], [164, 26], [6, 104], [96, 5], [174, 80], [22, 170], [84, 176]]; // spots on the frame (tile coords), clear of the level badge
const star = (cx: number, cy: number, r: number, k = r * 0.22) =>
  `M${cx} ${cy - r}L${cx + k} ${cy - k}L${cx + r} ${cy}L${cx + k} ${cy + k}L${cx} ${cy + r}L${cx - k} ${cy + k}L${cx - r} ${cy}L${cx - k} ${cy - k}Z`;

/**
 * One frame of rarity effects (t = 0..1 through the loop) as SVG under and over the card art.
 * Effects stack with rarity: rare glows, epic adds glass, legendary pulses with a shine sweep, mythic sparkles, secret gets a holo frame.
 */
function effects(list: Tile[], t: number, W: number, H: number, scale: number) {
  let defs = DEFS, under = "", over = "";
  list.forEach((c, i) => {
    const [x, y] = at(i), ax = x + 6, ay = y + 6;
    const rarity = getCard(c.slug).rarity, rank = RANK[rarity];
    const p = (t + i * 0.17) % 1; // per-card offset so the page doesn't move in lockstep
    const wave = rank >= RANK.legendary ? 0.5 + 0.5 * Math.sin(p * 2 * Math.PI) : 0.5;
    let stroke = hex(RARITY_COLOR[rarity]);
    if (rarity === "secret") {
      defs += `<linearGradient id="h${i}" gradientUnits="userSpaceOnUse" x1="${x}" y1="${y}" x2="${x + TILE}" y2="${y + TILE}" gradientTransform="rotate(${t * 360} ${x + TILE / 2} ${y + TILE / 2})">${HOLO}</linearGradient>`;
      stroke = `url(#h${i})`;
    }
    if (rank >= RANK.rare) under += `<rect x="${x + 4}" y="${y + 4}" width="${TILE - 8}" height="${TILE - 8}" rx="14" fill="none" stroke="${stroke}" stroke-width="${rank * 3 + wave * 8}" opacity="${0.3 + rank * 0.08 + wave * 0.2}" filter="url(#blur)"/>`;
    if (rank >= RANK.epic) {
      // Glass: a gloss over the art and a bright inner edge; legendary+ also gets a light sweep across it.
      const sweep = ax - 90 + p * 1.8 * (ART + 140);
      defs += `<clipPath id="c${i}"><rect x="${ax}" y="${ay}" width="${ART}" height="${ART}" rx="10"/></clipPath>`;
      over += `<g clip-path="url(#c${i})"><rect x="${ax}" y="${ay}" width="${ART}" height="${ART}" fill="url(#glass)"/>${rank >= RANK.legendary ? `<rect x="${sweep}" y="${ay - 40}" width="44" height="${ART + 80}" fill="url(#shine)" transform="rotate(20 ${sweep + 22} ${ay + ART / 2})"/>` : ""}</g>`;
      over += `<rect x="${ax + 2}" y="${ay + 2}" width="${ART - 4}" height="${ART - 4}" rx="9" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>`;
    }
    over += `<rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="${TILE - 6}" rx="14" fill="none" stroke="${stroke}" stroke-width="6"/>`;
    if (rank >= RANK.mythic) {
      const n = rarity === "secret" ? 7 : 4;
      for (let k = 0; k < n; k++) {
        const v = Math.sin((t * 2 + k / n) * 2 * Math.PI); // each twinkles twice per loop
        if (v <= 0) continue;
        const [sx, sy] = [x + SPARKS[k][0], y + SPARKS[k][1]];
        over += `<circle cx="${sx}" cy="${sy}" r="${6 + v * 8}" fill="url(#spark)" opacity="${v}"/><path d="${star(sx, sy, 3 + v * 8)}" fill="#fff" opacity="${v}"/>`;
      }
    }
    // Badge last so sparkles never cover it; a chip is sized to its text (approx. bold 15 px sans).
    const bw = c.chip ? Math.round(c.chip.length * 8.6 + 16) : 54;
    over += `<rect x="${x + TILE - 8 - bw}" y="${y + TILE - 34}" width="${bw}" height="26" rx="8" fill="#1e1030" stroke="${stroke}" stroke-width="2"/>
      <text x="${x + TILE - 8 - bw / 2}" y="${y + TILE - 15}" font-family="Geist, sans-serif" font-size="15" font-weight="bold" fill="${c.chip ? stroke : "#fff"}" text-anchor="middle">${c.chip ?? `Lv ${c.level}`}</text>`;
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
    .composite(await Promise.all(list.map(async (c, i) => ({ input: await thumb(c.slug, ART * up), left: (at(i)[0] + 6) * up, top: (at(i)[1] + 6) * up }))))
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

/** Draws every card's embed picture once (its collection tile, large, with a rarity chip) into cardPics. */
export async function warmCards() {
  const start = Date.now();
  for (const c of CARDS) {
    const { ext, data } = await render([{ slug: c.slug, chip: c.rarity[0].toUpperCase() + c.rarity.slice(1) }], TILE + 2 * PAD, TILE + 2 * PAD, CARD_SCALE);
    cardPics.set(c.slug, { name: `${c.slug}.${ext}`, data });
  }
  return { count: cardPics.size, ms: Date.now() - start };
}
