import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE, findGuide } from "../game/guide";
import { renderHelp, resolveCommand } from "./commands";

test("every command and alias in the guide exists in the bot", () => {
  for (const s of GUIDE)
    for (const c of s.commands)
      for (const name of [c.usage.split(" ")[0], ...(c.aliases ?? [])]) assert.ok(resolveCommand(name), `${s.key}: ${name}`);
});

test("findGuide matches topic keys, commands and aliases", () => {
  assert.equal(findGuide("auction")?.key, "auction");
  assert.equal(findGuide("feed")?.key, "cards");
  assert.equal(findGuide("bd h")?.key, "grind");
  assert.equal(findGuide("market sell")?.key, "market");
  assert.equal(findGuide("nope"), undefined);
  assert.equal(findGuide(""), undefined);
});

test("help fits Discord limits", () => {
  for (const q of ["", ...GUIDE.map((s) => s.key)]) {
    const e = renderHelp("123", q).embeds![0];
    const d = ("toJSON" in e ? e.toJSON() : e).description ?? "";
    assert.ok(d.length > 0 && d.length <= 4096, q);
  }
});
