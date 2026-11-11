"use client";
// 3D card. "reveal": spins in with a rarity-scaled particle burst (skippable).
// "inspect": drag, touch or arrow keys to turn, F or the Flip button to see the back; foil sheen follows the angle.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Rarity } from "@/game/data/cards";
import { RANK, RARITY_RGB, ease } from "./fx/stage";
import { useStage } from "./fx/useStage";

const BURST: Record<Rarity, number> = { common: 60, uncommon: 90, rare: 140, epic: 200, legendary: 300, mythic: 400, secret: 500 };

export default function CardStage({ slug, name, rarity, variant = "normal", mode = "reveal", skip = false }: {
  slug: string; name: string; rarity: Rarity; variant?: string; mode?: "reveal" | "inspect"; skip?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stage, failed } = useStage(canvasRef);
  const [ready, setReady] = useState(false);
  const cardRef = useRef<ReturnType<NonNullable<typeof stage>["card"]> | null>(null);
  const flipped = useRef(false);

  const flip = useCallback(async () => {
    const c = cardRef.current;
    if (!stage || !c) return;
    const from = c.root.rotation.y;
    flipped.current = !flipped.current;
    await stage.tween(500, (k) => { c.root.rotation.y = from + Math.PI * k; }, ease.inOut);
  }, [stage]);

  useEffect(() => {
    if (!stage) return;
    const card = stage.card(slug, rarity, variant);
    cardRef.current = card;
    const root = card.root;
    let alive = true;
    stage.scene.executeWhenReady(() => { if (alive) { setReady(true); stage.render(); } });

    if (mode === "inspect") {
      const c = canvasRef.current!;
      const detach = stage.inspect(c);
      // Render only while the player is interacting (plus a moment for inertia).
      let release: (() => void) | null = null;
      const start = () => { release ??= stage.hold(); };
      const stop = () => { const r = release; release = null; if (r) setTimeout(r, 600); };
      c.addEventListener("pointerdown", start);
      window.addEventListener("pointerup", stop);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "f" || e.key === "F") void flip();
        else if (e.key.startsWith("Arrow")) stage.holdFor(500);
      };
      c.addEventListener("keydown", onKey);
      // Hover tilt: the card leans toward the pointer (separate node, so it doesn't fight the flip).
      const tilt = new stage.B.TransformNode("tilt", stage.scene);
      root.parent = tilt;
      const aim = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || e.buttons) return; // touch/drag already turn the camera
        const r = c.getBoundingClientRect();
        aim.x = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
        aim.y = ((e.clientX - r.left) / r.width - 0.5) * -0.5;
        stage.holdFor(450);
      };
      const onLeave = () => { aim.x = aim.y = 0; stage.holdFor(450); };
      const ease = stage.scene.onBeforeRenderObservable.add(() => {
        tilt.rotation.x += (aim.x - tilt.rotation.x) * 0.15;
        tilt.rotation.y += (aim.y - tilt.rotation.y) * 0.15;
      });
      c.addEventListener("pointermove", onMove);
      c.addEventListener("pointerleave", onLeave);
      // Gentle intro turn so it reads as 3D.
      void stage.tween(1100, (k) => { root.rotation.y = (1 - k) * -0.9; });
      return () => {
        alive = false;
        c.removeEventListener("pointerdown", start);
        window.removeEventListener("pointerup", stop);
        c.removeEventListener("keydown", onKey);
        c.removeEventListener("pointermove", onMove);
        c.removeEventListener("pointerleave", onLeave);
        stage.scene.onBeforeRenderObservable.remove(ease);
        tilt.dispose(true); // the card itself is disposed just below
        release?.();
        detach();
        card.dispose();
      };
    }

    // Reveal: start small and showing the back, spin to the front, then burst.
    void (async () => {
      root.scaling.setAll(0.15);
      root.rotation.y = Math.PI * 4;
      await stage.tween(1300, (k) => { root.rotation.y = Math.PI * 4 * (1 - k); root.scaling.setAll(0.15 + 0.85 * k); }, ease.out);
      if (!alive) return;
      root.rotation.y = 0;
      root.scaling.setAll(1);
      const rgb = RARITY_RGB[rarity];
      stage.particles({ count: BURST[rarity], rgb, radius: 0.6, power: [2, 5], size: [0.04, 0.22] });
      if (RANK[rarity] >= RANK.epic) void stage.shake(350, 0.06 * (RANK[rarity] - 2));
      // Rare cards keep sparkling for a few seconds, then the scene goes idle (stops rendering).
      if (RANK[rarity] >= RANK.legendary) {
        const sp = stage.particles({ count: 150, rgb, radius: 2, rate: 25, power: [0.1, 0.4], size: [0.04, 0.12], gravity: 0.3, life: [0.6, 1.6] });
        setTimeout(() => sp?.stop(), 5000);
      }
      await stage.tween(4000, (k) => { root.rotation.y = Math.sin(k * Math.PI * 3) * 0.18 * (1 - k); }, ease.linear);
    })();
    return () => { alive = false; card.dispose(); };
  }, [stage, slug, rarity, variant, mode, flip]);

  useEffect(() => {
    if (!skip || !stage) return;
    stage.skip();
    if (cardRef.current) { cardRef.current.root.rotation.y = 0; cardRef.current.root.scaling.setAll(1); }
    stage.render();
  }, [skip, stage]);

  const showCanvas = ready && !failed;
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="relative w-full aspect-[5/7]">
        {/* Plain image first and as the fallback (no WebGL); the 3D canvas fades in over it once loaded. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static fallback under the canvas */}
        <img src={`/cards/${slug}.png`} alt={name} className={`absolute inset-[10%] w-[80%] rounded-lg transition-opacity duration-300 ${showCanvas ? "opacity-0" : "opacity-100"}`} />
        <canvas
          ref={canvasRef}
          tabIndex={mode === "inspect" ? 0 : -1}
          aria-label={mode === "inspect" ? `${name} in 3D. Drag or use the arrow keys to turn it, F to flip.` : undefined}
          aria-hidden={mode === "inspect" ? undefined : true}
          className={`absolute inset-0 size-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gold-400 transition-opacity duration-300 ${showCanvas ? "opacity-100" : "opacity-0"} ${mode === "inspect" ? "cursor-grab active:cursor-grabbing touch-none" : "pointer-events-none"}`}
        />
      </div>
      {mode === "inspect" && showCanvas && (
        <button type="button" onClick={() => void flip()} className="rounded-md bg-plum-800 px-3 py-1 text-xs hover:bg-plum-700">↻ Flip card</button>
      )}
    </div>
  );
}
