import path from "node:path";
import sharp from "sharp";
import { AttachmentBuilder } from "discord.js";
import { RARITIES, getCard, type Rarity } from "../game/data/cards";
import { RARITY_COLOR } from "./ui";

const TILE = 180;
const PAD = 20; // room for the rarity glow between tiles
const COLS = 5;
const ART = TILE - 12;
const FRAMES = 12;
const DELAY = 100; // ms per frame: a 1.2 s loop
const GIF_SCALE = 0.6; // GIF encoding is the slow part; Discord shows embed images ~400-500 px wide anyway
const thumbs = new Map<string, Buffer>(); // resized art per card, reused across requests (54 cards × ~20 KB)

async function thumb(slug: string) {
  let t = thumbs.get(slug);
  if (!t) {
    t = await sharp(path.join(process.cwd(), "public", "cards", `${slug}.png`)).resize(ART, ART).png().toBuffer();
    thumbs.set(slug, t);
  }
  return t;
}

type Tile = { slug: string; level: number };
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
    over += `<rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="${TILE - 6}" rx="14" fill="none" stroke="${stroke}" stroke-width="6"/>
      <rect x="${x + TILE - 62}" y="${y + TILE - 34}" width="54" height="26" rx="8" fill="#1e1030" stroke="${stroke}" stroke-width="2"/>
      <text x="${x + TILE - 35}" y="${y + TILE - 15}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#fff" text-anchor="middle">Lv ${c.level}</text>`;
    if (rank >= RANK.mythic) {
      const n = rarity === "secret" ? 7 : 4;
      for (let k = 0; k < n; k++) {
        const v = Math.sin((t * 2 + k / n) * 2 * Math.PI); // each twinkles twice per loop
        if (v <= 0) continue;
        const [sx, sy] = [x + SPARKS[k][0], y + SPARKS[k][1]];
        over += `<circle cx="${sx}" cy="${sy}" r="${6 + v * 8}" fill="url(#spark)" opacity="${v}"/><path d="${star(sx, sy, 3 + v * 8)}" fill="#fff" opacity="${v}"/>`;
      }
    }
  });
  const svg = (body: string) => Buffer.from(`<svg width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`);
  return { under: svg(under), over: svg(over) };
}

/**
 * One picture of a collection page: card art in a rarity-colored frame with a level badge and rarity effects.
 * A page with a legendary+ card is a looping GIF, otherwise a PNG. null if rendering fails (the text list still works).
 */
export async function collectionGrid(list: Tile[]): Promise<AttachmentBuilder | null> {
  if (!list.length) return null;
  try {
    const W = COLS * (TILE + PAD) + PAD;
    const H = Math.ceil(list.length / COLS) * (TILE + PAD) + PAD;
    const animated = list.some((c) => RANK[getCard(c.slug).rarity] >= RANK.legendary);
    const scale = animated ? GIF_SCALE : 1, w = Math.round(W * scale), h = Math.round(H * scale);
    // The art goes on its own layer once; every frame reuses it between its effect layers.
    const tiles = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(await Promise.all(list.map(async (c, i) => ({ input: await thumb(c.slug), left: at(i)[0] + 6, top: at(i)[1] + 6 }))))
      .raw().toBuffer();
    const art = await sharp(tiles, { raw: { width: W, height: H, channels: 4 } }).resize(w, h).png().toBuffer();
    const frame = (t: number) => {
      const fx = effects(list, t, W, H, scale);
      return sharp({ create: { width: w, height: h, channels: 4, background: "#140a22" } }).composite([{ input: fx.under }, { input: art }, { input: fx.over }]);
    };
    if (!animated) return new AttachmentBuilder(await frame(0).png().toBuffer(), { name: "collection.png" });
    const frames = await Promise.all(Array.from({ length: FRAMES }, (_, f) => frame(f / FRAMES).raw().toBuffer()));
    // effort 1 + light dither: ~10× faster than the defaults with no visible loss at this size.
    const gif = await sharp(Buffer.concat(frames), { raw: { width: w, height: h * FRAMES, channels: 4, pageHeight: h } })
      .gif({ delay: Array(FRAMES).fill(DELAY), loop: 0, effort: 1, dither: 0.5, interFrameMaxError: 6 })
      .toBuffer();
    return new AttachmentBuilder(gif, { name: "collection.gif" });
  } catch (e) {
    console.error("collection grid failed", e);
    return null;
  }
}
