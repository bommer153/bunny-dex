// Draws placeholder art for any card in the catalog that has no image yet: `npx tsx scripts/placeholder-art.ts`
// Never overwrites an existing file, so real art dropped into public/cards/<slug>.png always wins.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CARDS, type CardDef, type Element, type Rarity } from "../game/data/cards";

const OUT = path.join(import.meta.dirname, "..", "public", "cards");

// [sky light, sky dark, fur, fur shade]
const PALETTE: Record<Element, [string, string, string, string]> = {
  fire: ["#ffb26b", "#4a1010", "#ffe0c2", "#f2a97a"],
  water: ["#7fd3ff", "#0b2346", "#e4f5ff", "#a9cfe8"],
  nature: ["#b6eb8a", "#14381c", "#f1f8e2", "#c2d9a4"],
  electric: ["#fff07a", "#2a2148", "#fff8cf", "#e6d48a"],
  ice: ["#d6f6ff", "#17375a", "#f7fdff", "#c4def0"],
  shadow: ["#9b6fd6", "#120a22", "#6d5a86", "#4a3b5e"],
  light: ["#fff6c9", "#6b4914", "#fffbf2", "#ead9b8"],
};
const GLOW: Record<Rarity, string> = {
  common: "#ffffff", uncommon: "#4ade80", rare: "#60a5fa", epic: "#c084fc", legendary: "#facc15", mythic: "#f87171", secret: "#f0abfc",
};
const TIER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };

/** Small deterministic RNG so each card's sparkles stay the same between runs. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

export function svg(c: CardDef) {
  const [sky, deep, fur, shade] = PALETTE[c.element];
  const tier = TIER[c.rarity];
  const r = rng(c.slug);
  const sparkles = Array.from({ length: 18 + tier * 10 }, () => {
    const x = r() * 1024, y = r() * 760, s = 3 + r() * (6 + tier * 2);
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(1)}" fill="${r() < 0.3 ? GLOW[c.rarity] : "#fff"}" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`;
  }).join("");
  const eye = c.element === "shadow" ? "#f5e9ff" : "#2a1d36";
  const tilt = (r() - 0.5) * 16; // each bunny cocks its ears a little differently
  const crown = tier >= 4
    ? `<path d="M432 262 L452 206 L486 246 L512 192 L538 246 L572 206 L592 262 Z" fill="${GLOW[c.rarity]}" stroke="#fff8" stroke-width="4"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${GLOW[c.rarity]}" stop-opacity="${0.25 + tier * 0.08}"/><stop offset="1" stop-color="${GLOW[c.rarity]}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fur}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${sparkles}
  <ellipse cx="512" cy="900" rx="420" ry="90" fill="${deep}" opacity="0.55"/>
  <circle cx="512" cy="560" r="${360 + tier * 20}" fill="url(#halo)"/>
  <g transform="rotate(${(-12 + tilt).toFixed(1)} 430 330)"><ellipse cx="430" cy="230" rx="62" ry="170" fill="url(#fur)"/><ellipse cx="430" cy="240" rx="30" ry="125" fill="#ffb6c8" opacity="0.8"/></g>
  <g transform="rotate(${(12 + tilt).toFixed(1)} 594 330)"><ellipse cx="594" cy="230" rx="62" ry="170" fill="url(#fur)"/><ellipse cx="594" cy="240" rx="30" ry="125" fill="#ffb6c8" opacity="0.8"/></g>
  <ellipse cx="512" cy="700" rx="230" ry="200" fill="url(#fur)"/>
  <ellipse cx="420" cy="880" rx="80" ry="40" fill="${fur}"/><ellipse cx="604" cy="880" rx="80" ry="40" fill="${fur}"/>
  <circle cx="512" cy="450" r="185" fill="url(#fur)"/>
  ${crown}
  <ellipse cx="445" cy="455" rx="30" ry="38" fill="${eye}"/><ellipse cx="579" cy="455" rx="30" ry="38" fill="${eye}"/>
  <circle cx="455" cy="440" r="11" fill="#fff"/><circle cx="589" cy="440" r="11" fill="#fff"/>
  <ellipse cx="400" cy="515" rx="34" ry="20" fill="#ff8fab" opacity="0.45"/><ellipse cx="624" cy="515" rx="34" ry="20" fill="#ff8fab" opacity="0.45"/>
  <path d="M500 505 Q512 520 524 505 Q512 498 500 505 Z" fill="#ff7f9c"/>
  <path d="M512 520 Q500 545 484 540 M512 520 Q524 545 540 540" stroke="${eye}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
</svg>`;
}

async function main() {
  let made = 0;
  for (const c of CARDS) {
    const file = path.join(OUT, `${c.slug}.png`);
    if (fs.existsSync(file)) continue;
    await sharp(Buffer.from(svg(c))).png().toFile(file);
    console.log("drew", c.slug);
    made++;
  }
  console.log(`${made} placeholder(s) drawn, ${CARDS.length - made} cards already had art.`);
}
main();
