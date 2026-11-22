"use client";
// Hunt: a trail searches through purple mist while the server rolls (neutral: no rarity hint).
// ×1: the confirmed card rises face-down in 3D; press it to flip (flourish scaled to the real rarity).
// ×5 / ×10: face-down cards are dealt into the stage; tap each to flip, or Reveal all. Skip shows everything at once.
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import type { Rarity } from "@/game/data/cards";
import { RARITY_EMOJI, variantInfo, variantTag } from "@/game/config";
import { formatDuration } from "@/game/format";
import { huntPlay } from "../actions";
import { button, ghostButton, panel } from "../components";
import { Burst } from "../fx/Burst";
import { RANK, RARITY_RGB, ease, reducedMotion, type CardMesh } from "../fx/stage";
import { useStage } from "../fx/useStage";
import StageFrame from "../hud/StageFrame";
import { useConfirmed, useLock } from "../fx/useConfirmed";

type Batch = Extract<Awaited<ReturnType<typeof huntPlay>>, { ok: true }>["data"];
type Pull = Batch["cards"][number];
type Phase = "idle" | "searching" | "ready" | "revealing" | "shown" | "error";
const BURST: Record<Rarity, number> = { common: 50, uncommon: 80, rare: 130, epic: 200, legendary: 300, mythic: 400, secret: 520 };
const TEXT: Record<Rarity, string> = {
  common: "text-plum-200", uncommon: "text-green-400", rare: "text-blue-400", epic: "text-purple-300",
  legendary: "text-yellow-300", mythic: "text-red-400", secret: "text-fuchsia-300",
};
const GLOW: Record<Rarity, string> = {
  common: "", uncommon: "", rare: "shadow-[0_0_18px_2px_rgb(96_165_250/0.7)]", epic: "shadow-[0_0_22px_3px_rgb(192_132_252/0.75)]",
  legendary: "shadow-[0_0_26px_4px_rgb(250_204_21/0.8)]", mythic: "shadow-[0_0_30px_5px_rgb(248_113_113/0.8)]", secret: "shadow-[0_0_34px_6px_rgb(240_171_252/0.85)]",
};
const MIST: [number, number, number] = [0.42, 0.22, 0.62];
// hunting_animation.mp4 (10 s): calm meadow until ~2.5 s (a green glimmer starts at ~2.7 s), then a green column rising to a flash at ~9.8 s.
const VIDEO_CALM_END = 2.5, VIDEO_COLUMN = 6.5;
const BATCHES = [1, 5, 10] as const;

export default function HuntScene({ energy, max, cost, nextInMs }: { energy: number; max: number; cost: number; nextInMs: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stage, failed } = useStage(canvasRef, 6.5);
  const hunt = useConfirmed(huntPlay);
  const lock = useLock();
  const [phase, setPhase] = useState<Phase>("idle");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const flips = useRef<boolean[]>([]); // mirror of `flipped` for the staggered Reveal-all timers
  const [error, setError] = useState("");
  // HTML overlays around the 3D card: a light pillar in the rarity colour while it charges, a flash as it turns, the variant's banner.
  const [aura, setAura] = useState<{ color: string; rank: number; key: number } | null>(null);
  const [flash, setFlash] = useState<{ color: string; key: number } | null>(null);
  const [variantPop, setVariantPop] = useState<string | null>(null);
  // The meadow video (public/activity/hunting_animation.mp4) is the backdrop: calm meadow while searching, its green
  // column as the pillar for common/uncommon reveals; rarer finds fade it out for the coded pillar in their colour.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoOn, setVideoOn] = useState(false);
  const calm = useRef(false); // hold on the calm part (no rarity hint) until the reveal
  const fx = useRef<{ fog?: { stop: () => void } | null; trail?: { stop: () => void } | null; hover?: () => void; card?: CardMesh; step: number }>({ step: 0 });

  const multi = (batch?.cards.length ?? 0) > 1;
  const result: Pull | null = batch && !multi ? batch.cards[0] : null; // the single-hunt card
  const stopSearch = () => { fx.current.trail?.stop(); fx.current.trail = null; };
  const stopFog = () => { fx.current.fog?.stop(); fx.current.fog = null; };
  const stopHover = () => { fx.current.hover?.(); fx.current.hover = undefined; };

  async function start(n: number) {
    if (phase === "searching" || phase === "ready" || phase === "revealing") return;
    setError("");
    setBatch(null);
    setAura(null);
    setFlash(null);
    setVariantPop(null);
    flips.current = [];
    setFlipped([]);
    stopHover();
    fx.current.card?.dispose();
    fx.current.card = undefined;
    fx.current.step++;
    setPhase("searching");

    const v = videoRef.current;
    const useVideo = !!v && !reducedMotion();
    if (useVideo) {
      calm.current = true;
      v.currentTime = 0;
      v.playbackRate = 1;
      setVideoOn(true);
      void v.play().catch(() => setVideoOn(false)); // can't play (data saver, codec): the coded mist below still runs
    }
    if (stage) {
      stage.resume();
      const { B, scene } = stage;
      if (!useVideo) fx.current.fog = stage.particles({ count: 160, rgb: MIST, rate: 50, radius: 3.4, size: [1.4, 3], life: [2, 3.5], power: [0.05, 0.25], gravity: 0, blend: "standard", alpha: 0.16 });
      const head = new B.Vector3(-4, 0, 0);
      const trail = stage.particles({ count: 500, rgb: [0.95, 0.8, 0.4], rate: 170, at: head, radius: 0.05, size: [0.05, 0.15], life: [0.4, 0.9], power: [0.05, 0.3], gravity: 0 });
      fx.current.trail = trail;
      let t = 0;
      const move = scene.onBeforeRenderObservable.add(() => {
        t += stage.engine.getDeltaTime() / 1000;
        head.set(Math.sin(t * 1.3) * 3.4, Math.sin(t * 2.3) * 1.3, Math.cos(t * 1.1) * 0.6);
      });
      const stopTrail = trail?.stop;
      if (trail) trail.stop = () => { scene.onBeforeRenderObservable.remove(move); stopTrail?.(); };
    }

    // Keep the search visible for a moment even when the server is instant.
    const [r] = await Promise.all([hunt(n), new Promise((res) => setTimeout(res, stage?.reduced ? 0 : 900))]);
    if (!r) return; // left the page, or a duplicate click
    stopSearch();
    if (!r.ok) {
      stopFog();
      setVideoOn(false);
      setError(r.error);
      setPhase("error");
      if (stage) void stage.shake(300, 0.15);
      return;
    }
    setBatch(r.data);
    flips.current = r.data.cards.map(() => false);
    setFlipped(flips.current);
    setPhase("ready");
    if (r.data.cards.length > 1) return; // multi: the HTML card spread handles it; the mist keeps drifting behind
    if (!stage) return;
    // ×1: the confirmed card rises face-down out of the mist and hovers (the back gives nothing away).
    const one = r.data.cards[0];
    const card = stage.card(one.card.slug, one.rarity, one.card.variant);
    fx.current.card = card;
    const root = card.root;
    root.rotation.y = Math.PI;
    root.position.y = -4;
    root.scaling.setAll(0.7);
    const step = fx.current.step;
    await stage.tween(800, (k) => { root.position.y = -4 * (1 - k); root.scaling.setAll(0.7 + 0.3 * k); }, ease.out);
    // Only hover if the player hasn't already pressed the card or Skip while it was rising.
    if (stage.skipping || stage.disposed || fx.current.step !== step) return;
    const release = stage.hold();
    let t = 0;
    const bob = stage.scene.onBeforeRenderObservable.add(() => {
      t += stage.engine.getDeltaTime() / 1000;
      root.position.y = Math.sin(t * 2) * 0.08;
      root.rotation.y = Math.PI + Math.sin(t * 1.3) * 0.12;
    });
    fx.current.hover = () => { stage.scene.onBeforeRenderObservable.remove(bob); release(); };
  }

  async function reveal(r: Pull) {
    fx.current.step++;
    setPhase("revealing");
    const rank = RANK[r.rarity];
    calm.current = false;
    const v = videoRef.current;
    if (v && videoOn && rank <= RANK.uncommon) {
      // The video's green column becomes the pillar: sped up so its flash lands as the card turns (~1.3 s).
      v.currentTime = VIDEO_COLUMN;
      v.playbackRate = 2.5;
      void v.play().catch(() => {});
    } else setVideoOn(false);
    if (!stage) return setPhase("shown");
    stopHover();
    const rgb = RARITY_RGB[r.rarity];
    const card = fx.current.card ?? stage.card(r.card.slug, r.rarity, r.card.variant);
    fx.current.card = card;
    const root = card.root;
    const big = rank >= RANK.legendary;
    const color = `rgb(${rgb.map((v) => Math.round(v * 255)).join(" ")})`;
    const motion = !stage.reduced && !reducedMotion();
    // Rarer finds charge longer before the card turns: a pillar of light in the rarity colour rises behind it
    // (common/uncommon use the video's green column when it plays), sparks pour up through it,
    // and legendary+ cards shake harder and harder.
    if (motion && !(videoOn && rank <= RANK.uncommon)) setAura({ color, rank, key: fx.current.step });
    const charge = stage.particles({ count: 60 + rank * 40, rgb, rate: 40 + rank * 25, radius: 0.3, size: [0.1, 0.3], life: [0.3, 0.7], power: [0.5, 1.5], gravity: 0 });
    const rise = rank >= RANK.rare ? stage.particles({ count: 40 + rank * 30, rgb, rate: 30 + rank * 20, radius: 0.9, size: [0.03, 0.1], life: [0.6, 1.2], power: [0.2, 0.6], gravity: 1.2 }) : null;
    const shake = 0.03 * (rank + 1) * (big ? 1.8 : 1);
    await stage.tween(350 + rank * 170 + (big ? 300 : 0), (k) => {
      root.position.y = Math.sin(k * Math.PI * (6 + rank * 2)) * shake * k;
      if (big) root.rotation.z = Math.sin(k * Math.PI * 14) * 0.05 * k;
    }, ease.linear);
    root.rotation.z = 0;
    charge?.stop();
    rise?.stop();
    if (stage.skipping || stage.disposed) return; // Skip already showed the final card
    stopFog();
    stage.particles({ count: 50, rgb: MIST, radius: 1, size: [1.2, 2.5], life: [0.8, 1.4], power: [3, 6], gravity: 0, blend: "standard", alpha: 0.2 });
    const from = root.rotation.y;
    const flip = stage.tween(650 + rank * 90, (k) => {
      root.rotation.y = from + (Math.PI * 2 - from) * k; // to the front (2π ≡ 0)
      root.position.y = Math.sin(k * Math.PI) * 0.35;
      root.scaling.setAll(1 + Math.sin(k * Math.PI) * 0.12);
    }, ease.inOut);
    await stage.wait(300);
    // Edge-on: the flash hides the turn, the pillar gives way to the burst.
    if (motion) setFlash({ color, key: fx.current.step });
    setAura(null);
    stage.particles({ count: BURST[r.rarity], rgb, radius: 0.6, power: [2 + rank * 0.4, 5 + rank * 0.8], size: [0.04, 0.24] });
    if (rank >= RANK.epic) void stage.shake(400 + rank * 60, 0.05 * (rank - 2));
    await flip;
    root.rotation.y = 0;
    setTimeout(() => setVideoOn(false), 500); // after the video's flash: back to the dark stage so the card reads clearly
    if (big && !stage.skipping) {
      const sp = stage.particles({ count: 150, rgb, rate: 25, radius: 2.2, power: [0.1, 0.4], size: [0.04, 0.12], gravity: 0.3, life: [0.6, 1.6] });
      setTimeout(() => sp?.stop(), 4000);
    }
    // A special variant gets its own shimmer in the variant's colour and a banner.
    if (r.card.variant !== "normal" && !stage.skipping) {
      const v = variantInfo(r.card.variant).color;
      const vrgb = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
      stage.particles({ count: 90, rgb: vrgb, radius: 1.6, power: [0.3, 1.2], size: [0.03, 0.1], life: [0.5, 1.2], gravity: 0.4 });
      setVariantPop(r.card.variant);
    }
    setPhase((p) => (p === "revealing" ? "shown" : p));
  }

  // ---- ×5 / ×10 spread ----
  const finishSpread = () => { stopFog(); setPhase("shown"); };
  function flipOne(i: number) {
    if (flips.current[i] !== false) return; // already flipped (or a stale timer from an earlier hunt)
    flips.current = flips.current.map((v, k) => v || k === i);
    setFlipped(flips.current);
    if (flips.current.every(Boolean)) setTimeout(finishSpread, reducedMotion() ? 0 : 700);
  }
  function revealAll() {
    if (!batch) return;
    setPhase("revealing");
    const todo = flips.current.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const gap = reducedMotion() ? 0 : 160;
    todo.forEach((i, k) => setTimeout(() => flipOne(i), k * gap));
  }

  function skip() {
    fx.current.step++;
    calm.current = false;
    if (!multi) setVideoOn(false);
    if (multi) {
      flips.current = flips.current.map(() => true);
      setFlipped(flips.current);
      finishSpread();
      return;
    }
    setAura(null);
    if (stage && result) {
      stage.skip();
      stopSearch();
      stopFog();
      stopHover();
      const card = fx.current.card ?? stage.card(result.card.slug, result.rarity, result.card.variant);
      fx.current.card = card;
      card.root.rotation.y = 0;
      card.root.position.y = 0;
      card.root.scaling.setAll(1);
      stage.render();
    }
    setPhase("shown");
  }

  const enough = (n: number) => energy >= cost * n;
  const showFallback = (failed || !stage) && result && phase !== "searching";
  const fallbackFace = phase === "shown" || phase === "revealing";
  const best = batch?.cards.reduce((a, b) => (RANK[b.rarity] > RANK[a.rarity] ? b : a));
  const counts = batch ? Object.entries(batch.cards.reduce<Record<string, number>>((m, c) => ({ ...m, [c.rarity]: (m[c.rarity] ?? 0) + 1 }), {}))
    .sort(([a], [b]) => RANK[b as Rarity] - RANK[a as Rarity]) : [];
  const busy = phase === "searching" || phase === "ready" || phase === "revealing";

  return (
    <section id="hunt" className={`${panel} p-4 flex flex-col gap-3`} aria-labelledby="hunt-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hunt-title" className="flex items-center gap-2 font-semibold"><span className="gem" aria-hidden /> 🌿 Hunt</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${enough(1) ? "border-gold-500/50 text-gold-200" : "border-red-400/50 text-red-300"}`}>
          {enough(1) ? `✓ Ready · ⚡${energy}/${max} · ${cost} per hunt` : `✕ Out of energy · +1 in ${formatDuration(nextInMs)}`}
        </span>
      </div>
      <StageFrame glow={phase === "shown" && !!best && RANK[best.rarity] >= RANK.epic}>
      <div className={`relative w-full bg-[radial-gradient(ellipse_at_50%_60%,#3b1764,#130a20_70%)] ${multi ? "min-h-[16rem]" : "aspect-[4/3] sm:aspect-[16/9] max-h-[460px]"}`}>
        <video
          ref={videoRef}
          src="/activity/hunting_animation.mp4"
          muted
          playsInline
          preload="auto"
          aria-hidden
          onTimeUpdate={(e) => { if (calm.current && e.currentTarget.currentTime > VIDEO_CALM_END) e.currentTarget.pause(); }}
          className={`pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-700 ${videoOn ? "opacity-100" : "opacity-0"}`}
        />
        {aura && (
          // Behind the canvas (it's transparent), so the pillar rises behind the 3D card.
          <div key={aura.key} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="hunt-pillar" style={{ "--c": aura.color, "--w": `${16 + aura.rank * 6}%`, "--d": `${350 + aura.rank * 170}ms`, opacity: 0.45 + aura.rank * 0.08 } as CSSProperties} />
            {aura.rank >= RANK.legendary && <div className="hunt-pillar hunt-pillar-core" style={{ "--c": "#fff", "--w": "7%", "--d": "600ms" } as CSSProperties} />}
          </div>
        )}
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full pointer-events-none" />
        {flash && <div key={flash.key} aria-hidden className="hunt-flash" style={{ "--c": flash.color } as CSSProperties} />}
        {variantPop && phase === "shown" && (
          <p className={`vchip-${variantPop} anim-pop absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-current bg-plum-950/85 px-3 py-1 text-sm font-bold uppercase tracking-wider`}>
            {variantTag(variantPop)}variant!
          </p>
        )}
        {showFallback && (
          // eslint-disable-next-line @next/next/no-img-element -- no-WebGL fallback: the back while waiting, the art once revealed
          <img src={fallbackFace ? `/cards/${result.card.slug}.png` : "/brand/card-back.webp"} alt="" className="absolute inset-y-[6%] left-1/2 h-[88%] -translate-x-1/2 rounded-lg anim-pop" />
        )}

        {multi && batch && (
          <ul className={`relative mx-auto grid w-full max-w-[620px] grid-cols-5 gap-2 px-5 pb-14 pt-6 sm:gap-3`} aria-label={`${batch.cards.length} cards`}>
            {batch.cards.map((c, i) => {
              const on = flipped[i];
              return (
                <li key={c.card.code} className="anim-rise" style={{ animationDelay: `${i * 60}ms` }}>
                  <button
                    type="button"
                    onClick={() => flipOne(i)}
                    disabled={on}
                    aria-label={on ? `${c.name}, ${c.rarity}` : `Card ${i + 1} of ${batch.cards.length}, face down. Tap to reveal.`}
                    className="flip-card relative block aspect-[5/7] w-full rounded-lg disabled:cursor-default"
                  >
                    <span className={`flip-inner ${on ? "is-flipped" : ""}`}>
                      <span className="flip-face card-border">
                        <Image src="/brand/card-back.webp" alt="" width={120} height={168} className="size-full rounded-[5px] object-cover" />
                      </span>
                      <span className={`flip-face flip-front card-border ${on ? GLOW[c.rarity] : ""}`}>
                        <Image src={`/cards/${c.card.slug}.png`} alt="" width={120} height={168} className="size-full rounded-[5px] object-cover" />
                        {c.card.variant !== "normal" && (
                          <>
                            <span className={`vfx vfx-${c.card.variant}`} />
                            <span className={`vchip-${c.card.variant} absolute left-1 top-1 rounded-full border border-current bg-plum-950/85 px-1 text-[8px] font-bold uppercase leading-3 sm:text-[9px]`}>{variantInfo(c.card.variant).name}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {on && RANK[c.rarity] >= RANK.rare && <Burst items={["✨", "◆"]} count={8 + RANK[c.rarity] * 2} spread={45} salt={i + 1} />}
                  </button>
                  <div className={`mt-1 truncate text-center text-[10px] sm:text-xs ${on ? TEXT[c.rarity] : "text-transparent"}`}>{RARITY_EMOJI[c.rarity]} {variantTag(c.card.variant)}{c.name}</div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center p-4 pb-6 text-center pointer-events-none">
          {phase === "idle" && <p className="rounded-full bg-plum-950/70 px-3 py-1 text-sm text-plum-300">The meadow is quiet. Go hunting?</p>}
          {phase === "searching" && <p className="rounded-full bg-plum-950/70 px-3 py-1 text-sm text-plum-200" role="status"><span className="spinner" aria-hidden /> Searching the tall grass…</p>}
          {phase === "ready" && <p className="fx-glow rounded-full border border-gold-500/50 bg-plum-950/80 px-3 py-1 text-sm text-gold-200">✨ {multi ? "Tap the cards to reveal" : "Tap the card to reveal"}</p>}
          {phase === "error" && <p className="rounded-full bg-red-950/80 px-3 py-1 text-sm text-red-200 anim-shake" role="alert">✕ {error}</p>}
        </div>
        {/* ×1: the face-down 3D card itself is the reveal control (click, tap, or Enter/Space when focused). */}
        {phase === "ready" && result && (
          <button
            autoFocus
            onClick={() => void reveal(result)}
            aria-label="Reveal the card"
            className="hunt-card-hit absolute left-1/2 top-1/2 h-[74%] aspect-[5/7] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-xl outline-none"
          />
        )}
      </div>
      </StageFrame>

      {/* Action area: the result and the next action stay together. */}
      <div className="flex flex-wrap items-center gap-3 min-h-11" aria-live="polite">
        {multi && (phase === "ready" || phase === "revealing") && (
          <button onClick={revealAll} disabled={phase === "revealing"} className={`${button} px-5 py-2 text-base`}>✨ Reveal all</button>
        )}
        {(phase === "ready" || phase === "revealing") && <button onClick={skip} className={`${ghostButton} py-2`}>Skip ⏭</button>}

        {phase === "shown" && best && (
          <div className="gold-frame anim-pop">
            <div className="gold-frame-inner flex flex-col gap-0.5 px-4 py-2">
              {multi && <p className="text-[10px] uppercase tracking-widest text-gold-400">Best of {batch!.cards.length}</p>}
              <p className={`text-lg font-semibold ${TEXT[best.rarity]}`}>
                {RARITY_EMOJI[best.rarity]} {variantTag(best.card.variant)}{best.name} <span className="text-sm font-normal text-plum-400">({best.rarity})</span>
              </p>
              <p className="text-sm text-plum-300">
                {multi ? counts.map(([r, n]) => `${RARITY_EMOJI[r as Rarity]} ${n} ${r}`).join(" · ") : <>Code <code>{best.card.code}</code></>}
                {batch!.cards.some((c) => c.pity) && " · ✨ pity bonus"}{batch!.cards.some((c) => c.clover) && " · 🍀 clover"}{batch!.leveledUp && ` · 🎉 level ${batch!.level}!`}
                {" · "}<Link href="/collection" className="text-gold-300 underline">Collection</Link>
              </p>
            </div>
          </div>
        )}

        {!busy && (
          <div className="ml-auto flex flex-wrap items-center gap-2" role="group" aria-label="Hunt">
            {BATCHES.map((n) => (
              <button
                key={n}
                onClick={() => lock(() => start(n))}
                disabled={!enough(n)}
                className={n === 1 ? `${button} px-5 py-2 text-base` : `${ghostButton} border-gold-500/50 py-2 font-semibold text-gold-200`}
              >
                {n === 1 ? `🌿 ${!enough(1) ? `Need ⚡${cost}` : phase === "idle" ? "Hunt" : "Hunt again"} · ⚡${cost}` : !enough(n) ? `×${n} · need ⚡${cost * n}` : `×${n} · ⚡${cost * n}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
