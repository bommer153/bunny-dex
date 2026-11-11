// Small library of procedural effect clips (GIFs) for Discord replies, one per action / rarity / outcome.
// Drawn in code (no image assets, no native deps), built once in the background at startup and reused.
// Clips carry no text: the actual card, reward or price always stays in the embed so replies read fine without media.
import path from "node:path";
import { AttachmentBuilder } from "discord.js";
import sharp from "sharp";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { RARITIES, type Rarity } from "../game/data/cards";

type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const RARITY_RGB: Record<Rarity, RGB> = {
  common: hex(0xc0c0cc), uncommon: hex(0x4ade80), rare: hex(0x60a5fa), epic: hex(0xc084fc), legendary: hex(0xfacc15), mythic: hex(0xf87171), secret: hex(0xf0abfc),
};
const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<Rarity, number>;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in [0,1]. */
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Small RGB image (0..1 floats) for blitting into clips. */
type Img = { w: number; h: number; px: Float32Array };
/** The real BunnyDex card back, loaded once by warmFx (null until then, or if missing: a drawn stand-in is used). */
let CARD_BACK: Img | null = null;
async function loadCardBack() {
  try {
    const { data, info } = await sharp(path.join(process.cwd(), "public", "brand", "card-back.webp")).resize(50, 70).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    CARD_BACK = { w: info.width, h: info.height, px: Float32Array.from(data, (v) => v / 255) };
  } catch (e) {
    console.error("fx: card back not loaded, using a drawn stand-in:", e);
  }
}

/** Float RGB frame with additive glows and alpha shapes. */
class Raster {
  readonly px: Float32Array;
  constructor(readonly w: number, readonly h: number) { this.px = new Float32Array(w * h * 3); }
  fill(f: (x: number, y: number) => RGB) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = f(x, y), i = (y * this.w + x) * 3;
      this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
    }
  }
  /** Additive soft dot. */
  glow(cx: number, cy: number, r: number, c: RGB, a = 1) {
    if (a <= 0 || r <= 0) return;
    const R = r * 2.2;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
      const k = a * Math.exp(-d2 * 1.6);
      if (k < 0.004) continue;
      const i = (y * this.w + x) * 3;
      this.px[i] += c[0] * k; this.px[i + 1] += c[1] * k; this.px[i + 2] += c[2] * k;
    }
  }
  /** Additive ring (shockwave). */
  ring(cx: number, cy: number, r: number, th: number, c: RGB, a = 1) {
    const R = r + th * 3;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) - r;
      const k = a * Math.exp(-((d / th) ** 2));
      if (k < 0.004) continue;
      const i = (y * this.w + x) * 3;
      this.px[i] += c[0] * k; this.px[i + 1] += c[1] * k; this.px[i + 2] += c[2] * k;
    }
  }
  /** Four-point sparkle. */
  star(cx: number, cy: number, s: number, c: RGB, a = 1) {
    for (let d = -s; d <= s; d++) {
      const k = a * (1 - Math.abs(d) / (s + 1)) ** 2;
      this.dot(cx + d, cy, c, k);
      this.dot(cx, cy + d, c, k);
    }
    this.glow(cx, cy, s * 0.35, c, a);
  }
  private dot(x: number, y: number, c: RGB, k: number) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 3;
    this.px[i] += c[0] * k; this.px[i + 1] += c[1] * k; this.px[i + 2] += c[2] * k;
  }
  /** Alpha-blended rounded rectangle (cards, confetti). */
  rect(x0: number, y0: number, w: number, h: number, c: RGB, a = 1, radius = 0) {
    const xa = Math.max(0, Math.floor(x0)), xb = Math.min(this.w - 1, Math.ceil(x0 + w));
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(this.h - 1, Math.ceil(y0 + h));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = Math.max(x0 + radius - x, 0, x - (x0 + w - radius)), dy = Math.max(y0 + radius - y, 0, y - (y0 + h - radius));
      const cov = clamp01(radius - Math.hypot(dx, dy) + 0.5) * clamp01(Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y) + 0.5);
      const k = a * cov;
      if (k <= 0) continue;
      const i = (y * this.w + x) * 3;
      this.px[i] += (c[0] - this.px[i]) * k; this.px[i + 1] += (c[1] - this.px[i + 1]) * k; this.px[i + 2] += (c[2] - this.px[i + 2]) * k;
    }
  }
  /** Alpha-blended filled ellipse (coins). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1) {
    const xa = Math.max(0, Math.floor(cx - rx - 1)), xb = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const ya = Math.max(0, Math.floor(cy - ry - 1)), yb = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const d = Math.hypot((x - cx) / Math.max(rx, 0.5), (y - cy) / Math.max(ry, 0.5));
      const k = a * clamp01((1 - d) * Math.min(rx, ry) + 0.5);
      if (k <= 0) continue;
      const i = (y * this.w + x) * 3;
      this.px[i] += (c[0] - this.px[i]) * k; this.px[i + 1] += (c[1] - this.px[i + 1]) * k; this.px[i + 2] += (c[2] - this.px[i + 2]) * k;
    }
  }
  /** Draws an image centred at (cx, cy), squashed horizontally by sx (card flip). Gold-framed plum card if no image. */
  image(img: Img | null, cx: number, cy: number, w: number, h: number, sx = 1, a = 1) {
    const dw = Math.max(1, w * sx);
    if (!img) {
      this.rect(cx - dw / 2, cy - h / 2, dw, h, hex(0xf0b12a), a, 4);
      this.rect(cx - dw / 2 + 3, cy - h / 2 + 3, Math.max(0, dw - 6), h - 6, hex(0x2a1240), a, 3);
      return;
    }
    const x0 = Math.round(cx - dw / 2), y0 = Math.round(cy - h / 2);
    for (let y = 0; y < h; y++) {
      const Y = y0 + y;
      if (Y < 0 || Y >= this.h) continue;
      const sy = Math.floor((y / h) * img.h);
      for (let x = 0; x < dw; x++) {
        const X = x0 + x;
        if (X < 0 || X >= this.w) continue;
        const s = (sy * img.w + Math.floor((x / dw) * img.w)) * 3, i = (Y * this.w + X) * 3;
        this.px[i] += (img.px[s] - this.px[i]) * a; this.px[i + 1] += (img.px[s + 1] - this.px[i + 1]) * a; this.px[i + 2] += (img.px[s + 2] - this.px[i + 2]) * a;
      }
    }
  }
  /** Whole-frame tint (flashes). */
  wash(c: RGB, a: number) {
    if (a <= 0) return;
    for (let i = 0; i < this.px.length; i += 3) { this.px[i] += c[0] * a; this.px[i + 1] += c[1] * a; this.px[i + 2] += c[2] * a; }
  }
  /** To 8-bit RGBA, optionally shifted (screen shake). */
  rgba(shiftX = 0, shiftY = 0) {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    const sx = Math.round(shiftX), sy = Math.round(shiftY);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const X = Math.min(this.w - 1, Math.max(0, x - sx)), Y = Math.min(this.h - 1, Math.max(0, y - sy));
      const i = (Y * this.w + X) * 3, o = (y * this.w + x) * 4;
      out[o] = this.px[i] * 255; out[o + 1] = this.px[i + 1] * 255; out[o + 2] = this.px[i + 2] * 255; out[o + 3] = 255;
    }
    return out;
  }
}

type Clip = { w: number; h: number; frames: number; delay: number; draw: (r: Raster, t: number, f: number) => [number, number] | void };

function encode(c: Clip) {
  const gif = GIFEncoder();
  for (let f = 0; f < c.frames; f++) {
    const r = new Raster(c.w, c.h);
    const shift = c.draw(r, f / (c.frames - 1), f) ?? [0, 0];
    const rgba = r.rgba(shift[0], shift[1]);
    const palette = quantize(rgba, 128);
    gif.writeFrame(applyPalette(rgba, palette), c.w, c.h, { palette, delay: c.delay, repeat: -1 }); // play once
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

// ---------------- The clips ----------------
const W = 240, H = 135;

/**
 * Hunt: a gold trail searches the purple mist, the BunnyDex card rises face-down and flips,
 * then bursts in the confirmed rarity's colour (the card art itself follows in the embed).
 */
function hunt(rarity: Rarity): Clip {
  const rank = RANK[rarity], col = RARITY_RGB[rarity];
  const n = 40 + rank * 12;
  const parts = Array.from({ length: n }, (_, i) => { const r = rng(rank * 1000 + i); return { a: r() * Math.PI * 2, s: 0.4 + r() * 0.8, z: 0.8 + r() * 1.8 }; });
  const CW = 50, CH = 70;
  return {
    w: W, h: H, frames: 32 + rank * 2, delay: 60,
    draw(r, t) {
      const rise = clamp01((t - 0.36) / 0.2), flip = clamp01((t - 0.58) / 0.16), reveal = clamp01((t - 0.7) / 0.3);
      r.fill((x, y) => {
        const sky = mix(hex(0x1c0d30), hex(0x0d0716), y / H);
        const fog = (noise((x + t * 60) / 38, y / 22) * 0.65 + noise((x - t * 30) / 16, y / 11 + 9) * 0.35) * 0.55;
        const clear = clamp01(Math.hypot(x - W / 2, (y - H / 2) * 1.6) / (reveal * 150 + 0.01));
        return mix(sky, [0.42, 0.22, 0.62], fog * (reveal > 0 ? clear : 1));
      });
      const s = clamp01(t / 0.42); // search: a gold trail sweeps across
      for (let k = 0; k < 14 && t < 0.44; k++) {
        const u = s - k * 0.025;
        if (u < 0) break;
        r.glow(-10 + u * 260, H / 2 + Math.sin(u * 11) * 22, 3.2 - k * 0.18, [1, 0.85, 0.4], (1 - k / 14) * 0.9);
      }
      if (rise > 0 && reveal < 0.35) {
        // The face-down card rises, then turns edge-on; past the edge it's lit in the rarity colour.
        const cy = H + CH - (H / 2 + CH) * (1 - (1 - rise) ** 3);
        const sx = Math.abs(Math.cos(flip * Math.PI));
        r.glow(W / 2, cy, 30, [0.6, 0.3, 0.9], 0.35);
        if (flip < 0.5) r.image(CARD_BACK, W / 2, cy, CW, CH, sx);
        else r.rect(W / 2 - (CW * sx) / 2, cy - CH / 2, CW * sx, CH, mix(col, [1, 1, 1], 0.35), 1 - reveal * 2, 4);
      }
      if (reveal > 0) {
        r.glow(W / 2, H / 2, 6 + reveal * (14 + rank * 4), col, 1.1);
        r.ring(W / 2, H / 2, reveal * (60 + rank * 12), 2.5, col, (1 - reveal) * 0.9);
        for (const p of parts) r.glow(W / 2 + Math.cos(p.a) * reveal * 110 * p.s, H / 2 + Math.sin(p.a) * reveal * 70 * p.s, p.z, col, 1 - reveal * 0.8);
        if (rank >= RANK.legendary) for (let k = 0; k < 6; k++) { const a = k + t * 3; r.star(W / 2 + Math.cos(a) * 40 * reveal, H / 2 + Math.sin(a) * 26 * reveal, 6, col, 0.9); }
        if (reveal < 0.08) r.wash(col, 0.35);
        if (rank >= RANK.epic && reveal < 0.3) return [Math.sin(t * 90) * rank, Math.cos(t * 70) * rank * 0.6];
      }
    },
  };
}

/** Battle highlight: both cards dash in and clash; the confirmed winner side glows. side a = left. */
function battle(outcome: "a" | "b" | "draw"): Clip {
  const sparks = Array.from({ length: 36 }, (_, i) => { const r = rng(77 + i); return { a: r() * Math.PI * 2, s: 0.3 + r() }; });
  const L = hex(0x60a5fa), R = hex(0xf87171), gold = hex(0xfacc15);
  return {
    w: W, h: H, frames: 32, delay: 60,
    draw(r, t) {
      r.fill((x, y) => mix(hex(0x1a1030), hex(0x07070c), clamp01(Math.hypot(x - W / 2, y - H / 2) / 140)));
      r.rect(0, H - 22, W, 22, hex(0x120c1c), 1);
      const cw = 40, ch = 56, y = H / 2 - ch / 2 - 4;
      const slide = clamp01(t / 0.28), dash = clamp01((t - 0.3) / 0.14), after = clamp01((t - 0.44) / 0.56);
      const knock = (win: boolean) => (outcome === "draw" ? 16 : win ? 6 : 34) * Math.min(1, after * 3);
      let lx = -cw + slide * (36 + cw) + dash * 44, rx = W - (-cw + slide * (36 + cw) + dash * 44) - cw;
      lx -= knock(outcome === "a");
      rx += knock(outcome === "b");
      const dimL = outcome === "b" ? 1 - after * 0.6 : 1, dimR = outcome === "a" ? 1 - after * 0.6 : 1;
      if (after > 0 && outcome !== "draw") {
        const wx = outcome === "a" ? lx + cw / 2 : rx + cw / 2;
        r.glow(wx, y + ch / 2, 34, gold, 0.5 + 0.3 * Math.sin(t * 30));
      }
      for (const [x, c, d] of [[lx, L, dimL], [rx, R, dimR]] as const) {
        r.rect(x, y, cw, ch, mix(hex(0x111111), c, 0.9 * d), 1, 5);
        r.rect(x + 4, y + 4, cw - 8, ch - 8, mix(hex(0x0a0a0a), c, 0.35 * d), 1, 3);
        r.glow(x + cw / 2, y + ch / 2, 7, c, 0.8 * d);
      }
      if (after > 0) {
        const k = after;
        r.ring(W / 2, y + ch / 2, k * 90, 2.5, gold, (1 - k) * 0.9);
        for (const s of sparks) r.glow(W / 2 + Math.cos(s.a) * k * 90 * s.s, y + ch / 2 + Math.sin(s.a) * k * 55 * s.s, 1.6, [1, 0.95, 0.7], 1 - k);
        if (k < 0.1) r.wash([1, 0.95, 0.8], 0.5);
        if (k < 0.25) return [Math.sin(t * 120) * 4, Math.cos(t * 100) * 3];
      }
    },
  };
}

/** Combine: three orbs swirl together while the cauldron shakes (harder for rarer cards), then flash or fizzle. */
function combine(from: Rarity, ok: boolean): Clip {
  const rank = RANK[from], col = RARITY_RGB[from];
  const target = RARITY_RGB[RARITIES[Math.min(RARITIES.length - 1, rank + 1)]];
  const bits = Array.from({ length: 50 }, (_, i) => { const r = rng(500 + rank * 50 + i); return { a: r() * Math.PI * 2, s: 0.4 + r() * 0.9, z: 0.8 + r() * 1.6 }; });
  return {
    w: W, h: H, frames: 32 + rank * 3, delay: 60,
    draw(r, t) {
      const cx = W / 2, cy = H / 2;
      r.fill((x, y) => mix(hex(0x170d28), hex(0x08060d), clamp01(Math.hypot(x - cx, y - cy) / 150)));
      const build = clamp01(t / 0.62), end = clamp01((t - 0.66) / 0.34);
      const R = 62 * (1 - build), spin = build * build * 9;
      for (let i = 0; i < 3 && end === 0; i++) {
        const a = (i / 3) * Math.PI * 2 + spin;
        r.glow(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.55, 6, col, 1);
      }
      const charge = build * (0.6 + rank * 0.12);
      if (end === 0) {
        r.glow(cx, cy, 4 + build * 14, col, charge);
        for (let k = 0; k < 2 + rank * 2; k++) {
          const p = rng(Math.floor(t * 1000) + k);
          r.star(cx + (p() - 0.5) * 70 * build, cy + (p() - 0.5) * 40 * build, 3 + p() * 3, mix(col, [1, 1, 1], 0.5), build);
        }
        const amp = (1 + rank * 1.2) * build;
        return [(Math.random() - 0.5) * amp * 2, (Math.random() - 0.5) * amp * 1.4];
      }
      if (ok) {
        r.wash(target, (1 - end) * 0.6);
        r.glow(cx, cy, 10 + end * 22, target, 1.2);
        r.ring(cx, cy, end * 110, 3, target, (1 - end) * 0.9);
        for (const b of bits) r.glow(cx + Math.cos(b.a) * end * 120 * b.s, cy + Math.sin(b.a) * end * 75 * b.s, b.z, target, 1 - end * 0.7);
      } else {
        for (let k = 0; k < 9; k++) {
          const p = rng(900 + k);
          r.glow(cx + (p() - 0.5) * 50 * (1 + end), cy - end * 30 * p() + (p() - 0.5) * 20, 10 + end * 18, [0.45, 0.45, 0.5], (1 - end) * 0.5);
        }
        r.glow(cx, cy, 8 * (1 - end), col, 0.5 * (1 - end));
      }
    },
  };
}

/** Work payout: coins spring out of the carrot field and land in a pile. */
function work(): Clip {
  const coins = Array.from({ length: 7 }, (_, i) => { const r = rng(300 + i); return { vx: (r() - 0.5) * 70, vy: 95 + r() * 40, spin: r() * 6, delay: r() * 0.25 }; });
  const S = 128;
  return {
    w: S, h: S, frames: 20, delay: 55,
    draw(r, t) {
      r.fill((x, y) => (y > 88 ? mix(hex(0x1c2b12), hex(0x0f1a09), (y - 88) / 40) : mix(hex(0x1a1426), hex(0x2b1d10), y / 88)));
      for (let x = 10; x < S; x += 22) { r.rect(x, 82, 6, 10, hex(0xf97316), 1, 2); r.rect(x + 1, 76, 4, 7, hex(0x22c55e), 1, 1); }
      for (const c of coins) {
        const u = clamp01((t - c.delay) / (1 - c.delay));
        if (u <= 0) continue;
        const time = u * 1.1;
        const x = S / 2 + c.vx * time, y = 86 - c.vy * time + 170 * time * time;
        const landed = y > 100 ? 100 : y;
        const w = Math.abs(Math.cos(c.spin + u * 14)) * 7 + 1.5;
        r.ellipse(x, landed, w, 7, hex(0xb45309), 1);
        r.ellipse(x, landed, Math.max(0.5, w - 1.5), 5.5, hex(0xfacc15), 1);
        if (u > 0.85) r.star(x, landed - 6, 4, [1, 0.95, 0.6], (u - 0.85) * 6);
      }
    },
  };
}

/** Burrow: violet portal rings rush past and open into warm gold light. */
function burrow(): Clip {
  return {
    w: W, h: H, frames: 26, delay: 60,
    draw(r, t) {
      const cx = W / 2, cy = H / 2, light = clamp01((t - 0.55) / 0.45);
      r.fill((x, y) => {
        const dx = x - cx, dy = (y - cy) * 1.5;
        const d = Math.hypot(dx, dy) + 0.001;
        const depth = 46 / d;
        const stripe = 0.5 + 0.5 * Math.sin(depth * 7 - t * 22);
        const rough = 0.12 * noise(Math.atan2(dy, dx) * 4 + 10, depth * 2);
        const base = mix(hex(0x1a0b2e), hex(0x6d35a8), stripe * 0.75 + rough); // violet portal walls
        const fade = clamp01(d / 120);
        return mix([0, 0, 0], base, 0.25 + fade * 0.75);
      });
      r.glow(cx, cy, 6 + light * 70, hex(0xfde68a), 0.3 + light * 1.1);
      if (light > 0.6) r.wash(hex(0xfde68a), (light - 0.6) * 0.6);
    },
  };
}

/** Market transaction: a card catches the light, then coins burst out. */
function market(): Clip {
  const coins = Array.from({ length: 10 }, (_, i) => { const r = rng(600 + i); return { a: r() * Math.PI * 2, s: 0.5 + r() * 0.6 }; });
  const S = 128;
  return {
    w: S, h: S, frames: 18, delay: 55,
    draw(r, t) {
      r.fill((x, y) => mix(hex(0x1b1424), hex(0x0b0910), Math.hypot(x - S / 2, y - S / 2) / 90));
      const tilt = Math.abs(Math.cos(t * Math.PI * 1.5));
      const cw = 30 * (0.35 + 0.65 * tilt);
      r.rect(S / 2 - cw / 2, 34, cw, 46, hex(0xf9a8d4), 1, 4);
      r.rect(S / 2 - cw / 2 + 3, 37, Math.max(0, cw - 6), 40, hex(0x3b1d33), 1, 3);
      const sweep = clamp01(t / 0.5);
      if (sweep < 1) r.glow(S / 2 - 20 + sweep * 40, 57, 8, [1, 1, 1], 0.6);
      const burst = clamp01((t - 0.45) / 0.55);
      for (const c of coins) {
        if (burst <= 0) break;
        const x = S / 2 + Math.cos(c.a) * burst * 50 * c.s, y = 57 + Math.sin(c.a) * burst * 45 * c.s + burst * burst * 20;
        r.ellipse(x, y, 4, 4, hex(0xb45309), 1 - burst * 0.5);
        r.ellipse(x, y, 3, 3, hex(0xfacc15), 1 - burst * 0.5);
      }
      if (burst > 0.2) r.star(S / 2 + 22, 30, 6, [1, 0.95, 0.6], 1 - burst);
    },
  };
}

/** Auction close: the hammer comes down. Shockwave and confetti. */
function auction(): Clip {
  const confetti = Array.from({ length: 46 }, (_, i) => { const r = rng(800 + i); return { x: r() * W, v: 40 + r() * 70, sway: r() * 6, c: [hex(0xfacc15), hex(0xf472b6), hex(0x60a5fa), hex(0x4ade80)][i % 4], d: r() * 0.3 }; });
  return {
    w: W, h: H, frames: 28, delay: 60,
    draw(r, t) {
      r.fill((x, y) => mix(hex(0x1f1606), hex(0x0a0805), clamp01(Math.hypot(x - W / 2, y - H / 2) / 140)));
      const slam = clamp01(t / 0.18), after = clamp01((t - 0.18) / 0.82);
      const hy = -20 + slam * 70;
      r.rect(W / 2 - 22, hy, 44, 18, hex(0x7c4a1e), 1, 4); // hammer head
      r.rect(W / 2 - 3, hy - 30, 6, 32, hex(0x5b3415), 1, 2); // handle
      r.rect(W / 2 - 40, 70, 80, 8, hex(0x3f2a12), 1, 3); // block
      if (after > 0) {
        r.ring(W / 2, 70, after * 120, 3, hex(0xfacc15), (1 - after) * 0.9);
        // Gold seal with a violet gem stamps down beside the block.
        const seal = Math.min(1, after * 4), sr = 20 * (1.6 - 0.6 * seal);
        r.ellipse(W / 2 + 70, 52, sr, sr, hex(0xb8860b), seal);
        r.ellipse(W / 2 + 70, 52, sr * 0.82, sr * 0.82, hex(0xf0b12a), seal);
        r.ring(W / 2 + 70, 52, sr * 0.62, 1.2, hex(0xfff1b8), seal * 0.8);
        r.glow(W / 2 + 70, 52, 5, hex(0xa855f7), seal * 1.4);
        r.ring(W / 2, 70, after * 80, 2, [1, 1, 1], (1 - after) * 0.5);
        for (const c of confetti) {
          const u = clamp01((after - c.d) / (1 - c.d));
          if (u <= 0) continue;
          r.rect(c.x + Math.sin(u * 8 + c.sway) * 6, -6 + u * c.v * 1.4, 3, 5, c.c, 1 - u * 0.3, 1);
        }
        if (after < 0.08) r.wash([1, 0.9, 0.6], 0.45);
        if (after < 0.2) return [Math.sin(t * 140) * 4, Math.cos(t * 110) * 3];
      }
    },
  };
}

// ---------------- Registry ----------------
const CLIPS: Record<string, () => Clip> = {
  ...Object.fromEntries(RARITIES.map((r) => [`hunt-${r}`, () => hunt(r)])),
  ...Object.fromEntries(RARITIES.filter((r) => r !== "secret").flatMap((r) => [[`combine-${r}-ok`, () => combine(r, true)], [`combine-${r}-fail`, () => combine(r, false)]])),
  "battle-a": () => battle("a"), "battle-b": () => battle("b"), "battle-draw": () => battle("draw"),
  work, burrow, market, auction,
};
export type ClipName = keyof typeof CLIPS & string;
const built = new Map<string, { buf: Buffer; ms: number }>();

/** Builds every clip in the background, yielding between clips so the bot stays responsive. */
export async function warmFx() {
  const t0 = Date.now();
  await loadCardBack();
  for (const [name, make] of Object.entries(CLIPS)) {
    try {
      const c = make();
      built.set(name, { buf: encode(c), ms: c.frames * c.delay });
    } catch (e) {
      console.error(`fx ${name} failed:`, e); // replies just go out without this clip
    }
    await new Promise((r) => setImmediate(r));
  }
  return { count: built.size, ms: Date.now() - t0 };
}

/** The clip as an attachment, or null if it isn't built (yet). Embed it with `attachment://<name>.gif`. */
export function fx(name: string) {
  const c = built.get(name);
  return c ? { file: new AttachmentBuilder(c.buf, { name: `${name}.gif` }), url: `attachment://${name}.gif`, ms: c.ms } : null;
}
export const fxNames = () => Object.keys(CLIPS);
export const fxSize = (name: string) => built.get(name)?.buf.length ?? 0;

/** Dev aid (bot/fx-preview.ts): one still GIF with the clip at several moments stacked vertically. */
export function fxStills(name: string, moments: number[]) {
  const c = CLIPS[name]();
  const sheet = new Raster(c.w, c.h * moments.length);
  moments.forEach((t, k) => {
    const r = new Raster(c.w, c.h);
    c.draw(r, t, Math.round(t * (c.frames - 1)));
    sheet.px.set(r.px, k * c.w * c.h * 3);
  });
  const rgba = sheet.rgba();
  const palette = quantize(rgba, 256);
  const gif = GIFEncoder();
  gif.writeFrame(applyPalette(rgba, palette), sheet.w, sheet.h, { palette });
  gif.finish();
  return Buffer.from(gif.bytes());
}
