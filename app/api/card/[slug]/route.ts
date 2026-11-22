// The trading-card picture (same renderer as the Discord bot), cropped to the card itself, so the site and the bot
// show one card design. PNG, or an animated GIF for legendary and up.
import sharp from "sharp";
import { CARDS } from "@/game/data/cards";
import { VARIANTS } from "@/game/config";
import { CARD_CROP, drawCard } from "@/bot/grid";
import { cardPics, picKey } from "@/bot/ui";

// shortcut: caches only normal pictures (54, ~15 MB); variants are re-cropped per request, browsers cache them a day.
const cropped = new Map<string, { data: Buffer; type: string }>();

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const variant = new URL(req.url).searchParams.get("v") ?? "normal";
  // Trust boundary: only real cards and variants reach the renderer.
  if (!CARDS.some((c) => c.slug === slug) || !VARIANTS.some((v) => v.code === variant)) return new Response("Not found", { status: 404 });
  const key = picKey(slug, variant);
  let out = cropped.get(key);
  if (!out) {
    await drawCard(slug, variant);
    const pic = cardPics.get(key);
    if (!pic) return new Response("Card picture failed", { status: 500 });
    const img = sharp(pic.data, { animated: true });
    const m = await img.metadata();
    const W = m.width!, H = m.pageHeight ?? m.height!;
    const data = await img
      .extract({ left: Math.round(CARD_CROP.left * W), top: Math.round(CARD_CROP.top * H), width: Math.round(CARD_CROP.width * W), height: Math.round(CARD_CROP.height * H) })
      .toBuffer();
    out = { data, type: pic.name.endsWith(".gif") ? "image/gif" : "image/png" };
    if (variant === "normal") cropped.set(key, out);
  }
  return new Response(new Uint8Array(out.data), { headers: { "Content-Type": out.type, "Cache-Control": "public, max-age=86400" } });
}
