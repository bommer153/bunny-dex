// Turns public/activity/hunting_animation.mp4 into the frame sheet the Discord hunt clip is drawn on (bot/fx.ts).
// Discord only animates GIFs, so the bot can't use the video itself; it draws these frames into its own GIF.
// Uses headless Chrome to decode the video (no ffmpeg needed).
// Run after replacing the video:  node scripts/hunt-video-frames.mjs   (set CHROME if Chrome isn't in the default place)
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const VIDEO = path.resolve("public/activity/hunting_animation.mp4");
const OUT = "public/activity/hunting_frames.jpg";
const W = 320, H = 180, COLS = 6; // frame size (16:9) and sheet layout
// Two runs of frames, by the video's timeline: the calm meadow, then the green column up to its flash.
// bot/fx.ts reads them back by these counts (HUNT_CALM, HUNT_COLUMN), so change both together.
const CALM = { from: 0.1, to: 2.5, n: 12 }; // the green glimmer starts at ~2.7 s, so calm ends before it (no rarity hint)
const COLUMN = { from: 2.7, to: 9.95, n: 24 };
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const times = [CALM, COLUMN].flatMap((r) => Array.from({ length: r.n }, (_, k) => r.from + ((r.to - r.from) * k) / (r.n - 1)));
const dir = mkdtempSync(path.join(tmpdir(), "hunt-frames-"));
copyFileSync(VIDEO, path.join(dir, "v.mp4")); // same folder as the page, or Chrome treats the frames as cross-origin and won't read them back
writeFileSync(path.join(dir, "grab.html"), `<!doctype html><video id="v" src="v.mp4" muted preload="auto"></video><canvas id="c" width="${W}" height="${H}"></canvas>
<script>
window.grab = async (times) => {
  const v = document.getElementById("v"), g = document.getElementById("c").getContext("2d");
  await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
  const out = [];
  for (const t of times) {
    await new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = Math.min(t, v.duration - 0.02); });
    const s = Math.max(${W} / v.videoWidth, ${H} / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s; // cover
    g.drawImage(v, (${W} - w) / 2, (${H} - h) / 2, w, h);
    out.push(document.getElementById("c").toDataURL("image/png"));
  }
  return out;
};
</script>`);

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run", "--allow-file-access-from-files", `--user-data-dir=${path.join(dir, "profile")}`, pathToFileURL(path.join(dir, "grab.html")).href], { stdio: "ignore" });
try {
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page" && t.url.includes("grab.html"))?.webSocketDebuggerUrl; } catch {}
    if (!ws) await new Promise((r) => setTimeout(r, 250));
  }
  if (!ws) throw new Error(`Chrome didn't start (looked for it at ${CHROME}; set CHROME to its path)`);
  const sock = new WebSocket(ws);
  await new Promise((r) => sock.addEventListener("open", r));
  const reply = new Promise((r) => sock.addEventListener("message", (e) => r(JSON.parse(e.data))));
  sock.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: `grab(${JSON.stringify(times)})`, awaitPromise: true, returnByValue: true } }));
  const frames = (await reply).result?.result?.value;
  sock.close();
  if (!Array.isArray(frames) || frames.length !== times.length) throw new Error("couldn't read the video's frames");
  const sheet = frames.map((d, k) => ({ input: Buffer.from(d.split(",")[1], "base64"), left: (k % COLS) * W, top: Math.floor(k / COLS) * H }));
  await sharp({ create: { width: COLS * W, height: Math.ceil(frames.length / COLS) * H, channels: 3, background: "#000" } }).composite(sheet).jpeg({ quality: 84 }).toFile(OUT);
  console.log(`${frames.length} frames (${CALM.n} calm + ${COLUMN.n} column) → ${OUT}`);
} finally {
  chrome.kill();
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 500); // Chrome releases its profile folder on exit
}
