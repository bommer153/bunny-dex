import { before, test } from "node:test";
import assert from "node:assert/strict";
import { fx, warmFx, fxNames } from "./fx";
import { tryMedia, withoutMedia } from "./media";
import { battleReply, clipFrame, renderHelp, txReply, type Reply } from "./commands";
import { info } from "./ui";

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
