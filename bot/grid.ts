import path from "node:path";
import sharp from "sharp";
import { AttachmentBuilder } from "discord.js";
import { getCard } from "../game/data/cards";
import { RARITY_COLOR } from "./ui";

const TILE = 180;
const PAD = 8;
const COLS = 5;
const thumbs = new Map<string, Buffer>(); // resized art per card, reused across requests (54 cards × ~20 KB)

async function thumb(slug: string) {
  let t = thumbs.get(slug);
  if (!t) {
    t = await sharp(path.join(process.cwd(), "public", "cards", `${slug}.png`)).resize(TILE - 12, TILE - 12).png().toBuffer();
    thumbs.set(slug, t);
  }
  return t;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** One picture of a collection page: card art in a rarity-colored frame with a level badge. null if rendering fails (the text list still works). */
export async function collectionGrid(list: { slug: string; level: number }[]): Promise<AttachmentBuilder | null> {
  if (!list.length) return null;
  try {
    const rows = Math.ceil(list.length / COLS);
    const W = COLS * (TILE + PAD) + PAD;
    const H = rows * (TILE + PAD) + PAD;
    const layers = await Promise.all(list.map(async (c, i) => {
      const x = PAD + (i % COLS) * (TILE + PAD);
      const y = PAD + Math.floor(i / COLS) * (TILE + PAD);
      const color = hex(RARITY_COLOR[getCard(c.slug).rarity]);
      // Frame + level badge as SVG; text uses a generic font, so a server without fonts just shows the frame.
      const frame = Buffer.from(`<svg width="${TILE}" height="${TILE}" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="${TILE - 6}" height="${TILE - 6}" rx="14" fill="none" stroke="${color}" stroke-width="6"/>
        <rect x="${TILE - 62}" y="${TILE - 34}" width="54" height="26" rx="8" fill="#1e1030" stroke="${color}" stroke-width="2"/>
        <text x="${TILE - 35}" y="${TILE - 15}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#fff" text-anchor="middle">Lv ${c.level}</text>
      </svg>`);
      return [
        { input: await thumb(c.slug), left: x + 6, top: y + 6 },
        { input: frame, left: x, top: y },
      ];
    }));
    const png = await sharp({ create: { width: W, height: H, channels: 4, background: "#140a22" } }).composite(layers.flat()).png().toBuffer();
    return new AttachmentBuilder(png, { name: "collection.png" });
  } catch (e) {
    console.error("collection grid failed", e);
    return null;
  }
}
