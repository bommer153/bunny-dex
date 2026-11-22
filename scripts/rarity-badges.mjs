// Cuts the 7 rarity badges (Discord app emojis + the badge on card pictures) out of the sheet made with Gemini:
// white-bordered stickers on a black background, top row common → epic, bottom row legendary → secret.
// Run after replacing the sheet:  node scripts/rarity-badges.mjs   then upload the PNGs as app emojis (Developer Portal → Emojis).
import sharp from "sharp";

const SRC = "public/emojis/rarity-sheet.jpg";
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "secret"];
const SIZE = 128; // Discord emoji size

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const lum = (i) => (data[i * 3] * 299 + data[i * 3 + 1] * 587 + data[i * 3 + 2] * 114) / 1000;

// Background = everything not near-white that connects to the image edge; the unbroken white sticker borders stop it.
const bg = new Uint8Array(W * H);
const stack = new Int32Array(W * H);
let sp = 0;
const push = (i) => { if (!bg[i] && lum(i) <= 200) { bg[i] = 1; stack[sp++] = i; } };
for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
while (sp) {
  const i = stack[--sp], x = i % W;
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (i >= W) push(i - W);
  if (i < W * (H - 1)) push(i + W);
}

// Background turns transparent; its grey edge pixels become see-through white, so the border stays smooth (white-on-black matte).
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const a = bg[i] ? Math.max(0, Math.min(1, (lum(i) - 24) / (230 - 24))) : 1;
  for (let k = 0; k < 3; k++) rgba[i * 4 + k] = bg[i] ? 255 : data[i * 3 + k];
  rgba[i * 4 + 3] = Math.round(a * 255);
}

// Each sticker = one connected non-background blob; tiny ones are JPEG specks.
const label = new Int32Array(W * H).fill(-1);
const blobs = [];
for (let s = 0; s < W * H; s++) {
  if (bg[s] || label[s] >= 0) continue;
  const b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
  label[s] = blobs.length;
  stack[(sp = 0)] = s; sp = 1;
  while (sp) {
    const i = stack[--sp], x = i % W, y = (i - x) / W;
    b.n++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j >= 0 && j < W * H && !bg[j] && label[j] < 0) { label[j] = blobs.length; stack[sp++] = j; }
    }
  }
  blobs.push(b);
}
const stickers = blobs
  .filter((b) => b.n > W * H * 0.01)
  .sort((a, b) => (a.y0 > H / 2) - (b.y0 > H / 2) || a.x0 - b.x0); // top row first, then left to right
if (stickers.length !== RARITIES.length) throw new Error(`expected ${RARITIES.length} badges, found ${stickers.length}: is every white border unbroken and apart?`);

await Promise.all(stickers.map((b, k) => {
  const pad = Math.round((b.x1 - b.x0) * 0.04); // room for the soft outer edge
  const left = Math.max(0, b.x0 - pad), top = Math.max(0, b.y0 - pad);
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left, top, width: Math.min(W, b.x1 + pad + 1) - left, height: Math.min(H, b.y1 + pad + 1) - top })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(`public/emojis/bunnydex_rarity_${RARITIES[k]}.png`);
}));
console.log(`${stickers.length} badges → public/emojis/bunnydex_rarity_<rarity>.png`);
