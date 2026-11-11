// Dev helper: `npx tsx bot/fx-preview.ts [outDir]` builds all clips, prints size/time, and writes stills to outDir.
import fs from "node:fs";
import path from "node:path";
import { fxNames, fxSize, fxStills, warmFx } from "./fx";

const out = process.argv[2];
void warmFx().then(({ count, ms }) => {
  console.log(`built ${count}/${fxNames().length} clips in ${ms}ms`);
  for (const n of fxNames()) console.log(n.padEnd(22), `${(fxSize(n) / 1024).toFixed(0)} KB`.padStart(7));
  if (out) for (const n of fxNames()) fs.writeFileSync(path.join(out, `${n}.gif`), fxStills(n, [0.3, 0.6, 0.8, 1]));
});
