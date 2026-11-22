import { before, test } from "node:test";
import assert from "node:assert/strict";
import { fx, warmFx, fxNames } from "./fx";
import { tryMedia, withoutMedia } from "./media";
import { battleReply, clipFrame, renderHelp, txReply, type Reply } from "./commands";
import { cardEmbed, cardFile, info } from "./ui";
import sharp from "sharp";
import { collectionGrid, warmCards } from "./grid";
import { CARDS, RARITIES, type Rarity } from "../game/data/cards";

before(async () => { await warmFx(); });

test("every effect clip builds as a GIF under 1 MB", () => {
  for (const n of fxNames()) {
    const c = fx(n);
    assert.ok(c, n);
    const bytes = (c.file.attachment as Buffer);
    assert.equal(bytes.subarray(0, 6).toString(), "GIF89a", n);
    assert.ok(bytes.length < 1_000_000, `${n} is ${bytes.length} bytes`);
    assert.ok(c.ms > 0 && c.ms < 4000, `${n} lasts ${c.ms}ms`);
  }
});

test("clip frames keep their text and hold for the clip length", () => {
  const f = clipFrame("hunt-epic", "🌿 searching")!;
  const e = (f.embeds![0] as ReturnType<typeof info>).toJSON();
  assert.equal(e.description, "🌿 searching");
  assert.equal(e.image?.url, "attachment://hunt-epic.gif");
  assert.ok(f.ms! >= fx("hunt-epic")!.ms);
  assert.equal(clipFrame("no-such-clip", "x"), null); // unknown/unbuilt clip → caller falls back to text frames
});

test("when an upload is refused, the same reply goes out without media and keeps its text", async () => {
  const r: Reply = txReply("🛍️ You bought **Meadow Hop** for 🪙 **200**!");
  const sent: Reply[] = [];
  await tryMedia(r, async (x) => {
    sent.push(x);
    if (x.files?.length) throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
  });
  assert.equal(sent.length, 2);
  const last = sent[1].embeds![0] as { description?: string; thumbnail?: unknown };
  assert.match(last.description!, /Meadow Hop/);
  assert.equal(last.thumbnail, undefined);
  assert.equal(sent[1].files!.length, 0);
  // Other errors are not swallowed.
  await assert.rejects(tryMedia(r, async () => { throw Object.assign(new Error("boom"), { code: 10008 }); }), /boom/);
});

test("battle summary is readable without the highlight clip", () => {
  const fighter = (slug: string) => ({ def: { slug, name: slug, rarity: "common", element: "nature", atk: 1, def: 1, hp: 1 }, level: 1, code: "x" });
  const lanes = [0, 1, 2].map(() => ({ a: fighter("meadow-hop"), b: fighter("ember-puff"), pa: 50, pb: 40, winner: "a" as const }));
  const r = battleReply({ lanes, winner: "a", a: [], b: [] } as never, "Alice", "Bob");
  const plain = withoutMedia(r).embeds![0] as { description: string; image?: unknown };
  assert.match(plain.description, /Alice\*\* wins/);
  assert.match(plain.description, /Lane 3/);
  assert.equal(plain.image, undefined);
  assert.equal(r.frames?.length, 3); // lane-by-lane reveal still plays
});

test("help uses the mascot thumbnail and stays complete without media", () => {
  const r = renderHelp("123", "auction");
  const e = (r.embeds![0] as ReturnType<typeof info>).toJSON();
  assert.equal(e.thumbnail?.url, "attachment://mascot.png");
  assert.equal((r.files![0] as { name?: string }).name, "mascot.png");
  const plain = withoutMedia(r).embeds![0] as { description: string; thumbnail?: unknown };
  assert.equal(plain.thumbnail, undefined);
  assert.match(plain.description, /auction start/);
});

test("card pictures: framed in the rarity color, legendary+ animated, embed URL matches the file", async () => {
  await warmCards();
  const of = (r: Rarity) => CARDS.find((c) => c.rarity === r)!;
  const still = cardFile(of("uncommon").slug);
  const { data, info: m } = await sharp(still.attachment as Buffer).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [...data.subarray((y * m.width + x) * m.channels, (y * m.width + x) * m.channels + 3)];
  assert.deepEqual(px(57, 275), [0x22, 0xc5, 0x5e]); // left edge of the frame = uncommon green
  const legend = of("legendary");
  assert.equal(cardFile(legend.slug).name, `${legend.slug}.gif`);
  assert.equal((cardFile(legend.slug).attachment as Buffer).subarray(0, 6).toString(), "GIF89a");
  assert.equal(cardEmbed(legend, { image: "full" }).toJSON().image?.url, `attachment://${legend.slug}.gif`);
});

test("rarity badge emojis: one per rarity, 128 px, transparent around the gem", async () => {
  for (const r of RARITIES) {
    const { data, info: m } = await sharp(`public/emojis/bunnydex_rarity_${r}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([m.width, m.height], [128, 128], r);
    assert.equal(data[3], 0, `${r}: top-left corner should be transparent`);
  }
});

test("collection grid: a page with a legendary+ card loops as a GIF, other pages stay a PNG", async () => {
  const of = (r: Rarity) => ({ slug: CARDS.find((c) => c.rarity === r)!.slug, level: 1 });
  const gif = await collectionGrid([of("secret"), of("common")]);
  assert.equal(gif?.name, "collection.gif");
  const m = await sharp(gif!.attachment as Buffer, { animated: true }).metadata();
  assert.ok(m.pages! > 1 && m.loop === 0 && m.delay!.every((d) => d > 0), JSON.stringify({ pages: m.pages, loop: m.loop, delay: m.delay }));
  assert.equal((await collectionGrid([of("epic"), of("common")]))?.name, "collection.png");
});
