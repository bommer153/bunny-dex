// Cuts the web/Discord brand assets out of the card back the artist supplied.
// Run after replacing the source image:  node scripts/brand-assets.mjs
import fs from "node:fs";
import sharp from "sharp";

const SRC = "public/cards/BunnyDex Gold Bunny Card Back.png"; // 1060×1484
const OUT = "public/brand";
fs.mkdirSync(OUT, { recursive: true });

const circle = (s) => Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#fff"/></svg>`);
// Horizontal + vertical fade so the wordmark's purple backing melts into the header.
const fade = (w, h) => Buffer.from(`<svg width="${w}" height="${h}"><defs>
  <linearGradient id="x"><stop offset="0" stop-opacity="0"/><stop offset=".06" stop-color="#fff"/><stop offset=".94" stop-color="#fff"/><stop offset="1" stop-opacity="0"/></linearGradient>
  <radialGradient id="r" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-opacity="0"/></radialGradient>
  <mask id="m"><rect width="${w}" height="${h}" fill="url(#x)"/></mask></defs>
  <rect width="${w}" height="${h}" fill="url(#r)" mask="url(#m)"/></svg>`);

const jobs = [
  // Face-down cards and reveal animations (web Babylon texture + <img> fallbacks).
  sharp(SRC).resize(600).webp({ quality: 86 }).toFile(`${OUT}/card-back.webp`),
  // Round emblem for welcome, guide and hero result moments.
  sharp(SRC).extract({ left: 55, top: 205, width: 950, height: 950 }).resize(480).webp({ quality: 86 }).toFile(`${OUT}/emblem.webp`),
  // Mascot portrait: round, for the header logo, guide and Discord thumbnails.
  sharp(SRC).extract({ left: 200, top: 260, width: 600, height: 600 }).resize(160)
    .composite([{ input: circle(160), blend: "dest-in" }]).png({ palette: true, quality: 90 }).toFile(`${OUT}/mascot.png`),
  // Wordmark for the header.
  sharp(SRC).extract({ left: 150, top: 828, width: 780, height: 190 }).resize(480)
    .composite([{ input: fade(480, 117), blend: "dest-in" }]).webp({ quality: 88 }).toFile(`${OUT}/wordmark.webp`),
];
await Promise.all(jobs);
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(16), `${(fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0)} KB`);
