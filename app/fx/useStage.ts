"use client";
import { useEffect, useState, type RefObject } from "react";
import { createStage, type Stage } from "./stage";

// One engine per canvas at a time. React dev mode mounts effects twice; without this queue two Babylon engines would
// share the canvas's single WebGL context, and disposing the first leaves the second rendering black textures.
const queue = new WeakMap<HTMLCanvasElement, Promise<unknown>>();

/** Creates a Babylon stage on the canvas and disposes it on unmount. `failed` = no WebGL (show the HTML fallback). */
export function useStage(ref: RefObject<HTMLCanvasElement | null>, radius?: number) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let s: Stage | null = null;
    let dead = false;
    const run = (queue.get(canvas) ?? Promise.resolve()).then(async () => {
      if (dead) return; // unmounted before it started (dev double-mount): never create this engine
      try {
        const st = await createStage(canvas, { radius });
        if (dead) return st.dispose();
        s = st;
        setStage(st);
      } catch {
        if (!dead) setFailed(true);
      }
    });
    queue.set(canvas, run);
    return () => {
      dead = true;
      s?.dispose();
      setStage(null);
    };
  }, [ref, radius]);
  return { stage, failed };
}
