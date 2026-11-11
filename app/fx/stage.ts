// Shared Babylon.js stage for the web scenes (hunt, battle, combine reveal, card inspect).
// - Babylon is imported lazily, once, so it only downloads on pages that show a scene.
// - Render on demand: the loop runs only while something animates and the canvas is on screen and the tab visible.
// - Tweens run off the render loop and can be fast-forwarded, so Skip always lands on the same final state.
import type * as BABYLON from "@babylonjs/core";
import type { Rarity } from "@/game/data/cards";

type B = typeof BABYLON;
let lib: Promise<B> | null = null;
export const loadBabylon = () => (lib ??= import("@babylonjs/core"));

export const RARITY_RGB: Record<Rarity, [number, number, number]> = {
  common: [0.75, 0.75, 0.8], uncommon: [0.3, 0.9, 0.45], rare: [0.3, 0.55, 1], epic: [0.7, 0.35, 1],
  legendary: [1, 0.8, 0.2], mythic: [1, 0.3, 0.3], secret: [1, 0.45, 0.95],
};
export const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const FOIL: Record<Rarity, number> = { common: 0, uncommon: 0.1, rare: 0.18, epic: 0.26, legendary: 0.36, mythic: 0.44, secret: 0.52 };

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export const ease = {
  linear: (k: number) => k,
  out: (k: number) => 1 - (1 - k) ** 3,
  in: (k: number) => k ** 3,
  inOut: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  back: (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export type Stage = Awaited<ReturnType<typeof createStage>>;
export type CardMesh = ReturnType<Stage["card"]>;

export async function createStage(canvas: HTMLCanvasElement, opts: { radius?: number } = {}) {
  if (!webglOk()) throw new Error("WebGL unavailable");
  const B = await loadBabylon();
  const engine = new B.Engine(canvas, true, { alpha: true, preserveDrawingBuffer: false, stencil: false }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0, 0, 0, 0);
  const camera = new B.ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2, opts.radius ?? 5.2, B.Vector3.Zero(), scene);
  camera.minZ = 0.1;
  const light = new B.HemisphericLight("light", new B.Vector3(0, 1, -1), scene);
  light.intensity = 1.1;
  const reduced = reducedMotion();

  // ---- render on demand ----
  let holds = 0;
  let onScreen = true;
  let running = false;
  let disposed = false;
  const frame = () => scene.render();
  const sync = () => {
    const want = !disposed && onScreen && !document.hidden && holds > 0;
    if (want && !running) {
      engine.runRenderLoop(frame);
      running = true;
    } else if (!want && running) {
      engine.stopRenderLoop(frame);
      running = false;
    }
    if (!running && !disposed) scene.render(); // keep the last frame correct
  };
  /** Keeps the loop running until the returned release() is called. */
  const hold = () => {
    holds++;
    sync();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      holds--;
      sync();
    };
  };
  const holdFor = (ms: number) => setTimeout(hold(), ms);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  const ro = new ResizeObserver(() => { engine.resize(); sync(); });
  ro.observe(canvas);

  // ---- tweens ----
  type Tween = { start: number; ms: number; apply: (k: number) => void; ease: (k: number) => number; done: () => void };
  const tweens = new Set<Tween>();
  let skipping = false;
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.apply(t.ease(k));
      if (k >= 1) { tweens.delete(t); t.done(); }
    }
  });
  /** Animates apply(0→1) over ms. Instant when skipping, disposed or reduced motion. */
  const tween = (ms: number, apply: (k: number) => void, e: (k: number) => number = ease.out) =>
    new Promise<void>((resolve) => {
      if (disposed || skipping || reduced || ms <= 0) { apply(1); resolve(); return; }
      const release = hold();
      tweens.add({ start: performance.now(), ms, apply, ease: e, done: () => { release(); resolve(); } });
    });
  const wait = (ms: number) => tween(ms, () => {}, ease.linear);
  const systems = new Set<BABYLON.ParticleSystem>();
  /** Jumps every running tween to its end; later tweens resolve instantly until resume(). */
  const skip = () => {
    skipping = true;
    for (const t of [...tweens]) { tweens.delete(t); t.apply(1); t.done(); }
    for (const ps of systems) ps.dispose();
    systems.clear();
    sync();
  };
  const resume = () => { skipping = false; };

  // ---- textures drawn in code (no extra assets) ----
  const dot = new B.DynamicTexture("dot", 64, scene);
  {
    const d = dot.getContext() as CanvasRenderingContext2D;
    const g = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    d.fillStyle = g;
    d.fillRect(0, 0, 64, 64);
    dot.hasAlpha = true;
    dot.update();
  }

  type PSOpts = {
    count: number; rgb: [number, number, number]; at?: BABYLON.Vector3; radius?: number; size?: [number, number];
    life?: [number, number]; power?: [number, number]; gravity?: number; rate?: number; blend?: "add" | "standard"; alpha?: number;
  };
  /** Particle system. rate → continuous (caller stops it), otherwise a one-off burst. */
  function particles(o: PSOpts) {
    if (disposed || skipping || reduced) return null;
    const [r, g, b] = o.rgb;
    const a = o.alpha ?? 1;
    const ps = new B.ParticleSystem("fx", o.count, scene);
    ps.particleTexture = dot;
    ps.emitter = o.at ?? B.Vector3.Zero();
    ps.createSphereEmitter(o.radius ?? 0.5);
    ps.color1 = new B.Color4(r, g, b, a);
    ps.color2 = new B.Color4(Math.min(1, r + 0.4), Math.min(1, g + 0.4), Math.min(1, b + 0.4), a);
    ps.colorDead = new B.Color4(r, g, b, 0);
    [ps.minSize, ps.maxSize] = o.size ?? [0.04, 0.2];
    [ps.minLifeTime, ps.maxLifeTime] = o.life ?? [0.5, 1.2];
    [ps.minEmitPower, ps.maxEmitPower] = o.power ?? [2, 5];
    ps.gravity = new B.Vector3(0, o.gravity ?? -2, 0);
    ps.blendMode = o.blend === "standard" ? B.ParticleSystem.BLENDMODE_STANDARD : B.ParticleSystem.BLENDMODE_ADD;
    systems.add(ps);
    ps.onDisposeObservable.addOnce(() => systems.delete(ps));
    if (o.rate) {
      ps.emitRate = o.rate;
      const release = hold();
      ps.start();
      return { ps, stop: () => { ps.stop(); setTimeout(() => { release(); ps.dispose(); }, (o.life?.[1] ?? 1.2) * 1000); } };
    }
    ps.manualEmitCount = o.count;
    ps.targetStopDuration = 0.2;
    ps.disposeOnStop = true;
    holdFor(((o.life?.[1] ?? 1.2) + 0.3) * 1000);
    ps.start();
    return { ps, stop: () => ps.stop() };
  }

  /** Camera shake that decays to zero. */
  const shake = (ms: number, amp: number) => {
    const base = camera.target.clone();
    return tween(ms, (k) => {
      const a = amp * (1 - k);
      camera.target.set(base.x + (Math.random() - 0.5) * a, base.y + (Math.random() - 0.5) * a, base.z);
    }, ease.linear);
  };

  /** Text on a plane that floats up and fades (damage numbers, labels). */
  async function floatText(text: string, at: BABYLON.Vector3, color: string, size = 1, rise = 0.7, ms = 1200) {
    if (disposed) return;
    const tex = new B.DynamicTexture("txt", { width: 512, height: 128 }, scene);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.font = "900 92px sans-serif";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(text, 256, 98);
    ctx.shadowColor = color; // glow so it reads on the dark arena
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 98);
    tex.update();
    const plane = B.MeshBuilder.CreatePlane("txt", { width: size * 4, height: size }, scene);
    const mat = new B.StandardMaterial("txt", scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new B.Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.useAlphaFromDiffuseTexture = true;
    plane.material = mat;
    plane.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    plane.position.copyFrom(at);
    plane.renderingGroupId = 1;
    await tween(ms, (k) => { plane.position.y = at.y + rise * k; mat.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25; });
    plane.dispose();
    mat.dispose();
    tex.dispose();
  }

  /** A card: art on the front, a drawn back, and a foil sheen that moves as the card turns. */
  function card(slug: string, rarity: Rarity, variant = "normal", w = 2.5) {
    const h = w * 1.4;
    const root = new B.TransformNode("card", scene);
    const front = B.MeshBuilder.CreatePlane("front", { width: w, height: h }, scene);
    const frontMat = new B.StandardMaterial("frontMat", scene);
    frontMat.diffuseTexture = new B.Texture(`/cards/${slug}.png`, scene);
    frontMat.emissiveColor = new B.Color3(0.45, 0.45, 0.45);
    frontMat.specularColor = new B.Color3(0.08, 0.08, 0.08);
    front.material = frontMat;
    front.parent = root;

    const [r, g, b] = RARITY_RGB[rarity];
    // The real BunnyDex card back (public/brand/card-back.webp, cut from the artist's image by scripts/brand-assets.mjs).
    const back = B.MeshBuilder.CreatePlane("back", { width: w, height: h }, scene);
    const backMat = new B.StandardMaterial("backMat", scene);
    backMat.diffuseTexture = new B.Texture("/brand/card-back.webp", scene);
    backMat.emissiveColor = new B.Color3(0.45, 0.45, 0.45);
    backMat.specularColor = new B.Color3(0.08, 0.08, 0.08);
    back.material = backMat;
    back.rotation.y = Math.PI;
    back.parent = root;

    // Gold card border (both faces): polished gold rim, a thin rarity-colour trim around the art, violet corner gems.
    const m = w * 0.07;
    const FW = 256, FH = Math.round((FW * (h + 2 * m)) / (w + 2 * m));
    const mx = (FW * m) / (w + 2 * m), my = (FH * m) / (h + 2 * m);
    const frameTex = new B.DynamicTexture("frameTex", { width: FW, height: FH }, scene);
    frameTex.hasAlpha = true;
    const fc = frameTex.getContext() as CanvasRenderingContext2D;
    fc.clearRect(0, 0, FW, FH);
    const fg = fc.createLinearGradient(0, 0, FW, FH);
    [["#fff1b8", 0], ["#f0b12a", 0.28], ["#8f600b", 0.52], ["#fbc94a", 0.78], ["#fff1b8", 1]].forEach(([c, o]) => fg.addColorStop(o as number, c as string));
    fc.fillStyle = fg;
    fc.beginPath();
    if (fc.roundRect) fc.roundRect(0, 0, FW, FH, 14); else fc.rect(0, 0, FW, FH);
    fc.fill();
    fc.strokeStyle = "rgba(60,30,0,0.55)"; // engraved inner edge
    fc.lineWidth = 2;
    fc.strokeRect(mx * 0.45, my * 0.45, FW - mx * 0.9, FH - my * 0.9);
    fc.strokeStyle = `rgb(${r * 255},${g * 255},${b * 255})`; // rarity trim right around the art
    fc.lineWidth = 3;
    fc.strokeRect(mx - 2, my - 2, FW - 2 * mx + 4, FH - 2 * my + 4);
    for (const [gx, gy] of [[mx / 2, my / 2], [FW - mx / 2, my / 2], [mx / 2, FH - my / 2], [FW - mx / 2, FH - my / 2]]) {
      const s = mx * 0.42;
      const gem = fc.createLinearGradient(gx - s, gy - s, gx + s, gy + s);
      gem.addColorStop(0, "#e9d5ff"); gem.addColorStop(0.5, "#a855f7"); gem.addColorStop(1, "#581c87");
      fc.fillStyle = gem;
      fc.strokeStyle = "#ffdb6e";
      fc.lineWidth = 1.5;
      fc.beginPath();
      fc.moveTo(gx, gy - s); fc.lineTo(gx + s, gy); fc.lineTo(gx, gy + s); fc.lineTo(gx - s, gy); fc.closePath();
      fc.fill(); fc.stroke();
    }
    frameTex.update();
    const frameMat = new B.StandardMaterial("frameMat", scene);
    frameMat.diffuseTexture = frameTex;
    frameMat.useAlphaFromDiffuseTexture = true;
    frameMat.emissiveColor = new B.Color3(0.55, 0.55, 0.55);
    frameMat.specularColor = new B.Color3(0.4, 0.35, 0.2);
    for (const side of [0, 1]) {
      const frame = B.MeshBuilder.CreatePlane("frame", { width: w + 2 * m, height: h + 2 * m }, scene);
      frame.material = frameMat;
      frame.rotation.y = side ? Math.PI : 0;
      frame.position.z = side ? -0.004 : 0.004; // just behind each face, so the art sits inside the rim
      frame.parent = root;
    }

    // Foil: a diagonal light band, added on top of the art. Stronger for rarer cards and special variants.
    const special = variant !== "normal";
    const strength = Math.min(0.75, FOIL[rarity] + (special ? 0.22 : 0));
    let foilMat: BABYLON.StandardMaterial | null = null;
    if (strength > 0) {
      const foilTex = new B.DynamicTexture("foilTex", { width: 256, height: 256 }, scene);
      const f = foilTex.getContext() as CanvasRenderingContext2D;
      const fg = f.createLinearGradient(0, 0, 256, 256);
      const tint = special ? ["#ff6ad5", "#7afcff", "#feff9c"] : [`rgb(${r * 255},${g * 255},${b * 255})`, "#ffffff", `rgb(${r * 255},${g * 255},${b * 255})`];
      fg.addColorStop(0, "#000");
      fg.addColorStop(0.38, "#000");
      fg.addColorStop(0.45, tint[0]);
      fg.addColorStop(0.5, tint[1]);
      fg.addColorStop(0.55, tint[2]);
      fg.addColorStop(0.62, "#000");
      fg.addColorStop(1, "#000");
      f.fillStyle = fg;
      f.fillRect(0, 0, 256, 256);
      foilTex.update();
      foilTex.wrapU = B.Texture.WRAP_ADDRESSMODE;
      foilMat = new B.StandardMaterial("foil", scene);
      foilMat.emissiveTexture = foilTex;
      foilMat.diffuseColor = new B.Color3(0, 0, 0);
      foilMat.specularColor = new B.Color3(0, 0, 0);
      foilMat.disableLighting = true;
      foilMat.alphaMode = B.Engine.ALPHA_ADD;
      foilMat.alpha = strength;
      const foil = B.MeshBuilder.CreatePlane("foil", { width: w, height: h }, scene);
      foil.material = foilMat;
      foil.position.z = -0.003;
      foil.parent = root;
    }
    const sheen = scene.onBeforeRenderObservable.add(() => {
      if (foilMat?.emissiveTexture) (foilMat.emissiveTexture as BABYLON.Texture).uOffset = (root.rotation.y + camera.alpha) * 0.35;
    });
    const mats = [frontMat, backMat, frameMat, foilMat].filter(Boolean) as BABYLON.StandardMaterial[];
    const base = mats.map((m) => m.emissiveColor.clone());
    return {
      root,
      /** 1 = normal, lower = darker (defeated cards). */
      dim(k: number) { mats.forEach((m, i) => m.emissiveColor.copyFrom(base[i].scale(k))); frontMat.diffuseColor.set(k, k, k); },
      dispose() { scene.onBeforeRenderObservable.remove(sheen); root.dispose(false, true); },
    };
  }

  /** Lets the player turn the camera around the card (drag, touch, ←/→); no zoom or pan. Returns detach(). */
  function inspect(target: HTMLCanvasElement) {
    camera.attachControl(target, true);
    camera.lowerRadiusLimit = camera.upperRadiusLimit = camera.radius;
    camera.panningSensibility = 0;
    camera.lowerBetaLimit = Math.PI / 2 - 0.7;
    camera.upperBetaLimit = Math.PI / 2 + 0.7;
    camera.keysUp = [];
    camera.keysDown = []; // up/down keep scrolling the page
    return () => camera.detachControl();
  }

  return {
    B, engine, scene, camera, reduced, inspect,
    hold, holdFor, tween, wait, skip, resume, particles, shake, floatText, card,
    get skipping() { return skipping; },
    get disposed() { return disposed; },
    render: () => sync(),
    dispose() {
      if (disposed) return;
      skip();
      disposed = true;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      engine.stopRenderLoop();
      engine.dispose();
    },
  };
}
