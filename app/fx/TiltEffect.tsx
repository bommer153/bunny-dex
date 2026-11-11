"use client";
// One document-level listener tilts any `.tilt` element toward the pointer (desktop mouse only, not with reduced motion).
import { useEffect } from "react";
import { reducedMotion } from "./stage";

export default function TiltEffect() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || reducedMotion()) return;
    let current: HTMLElement | null = null;
    const reset = (el: HTMLElement | null) => { el?.style.removeProperty("--rx"); el?.style.removeProperty("--ry"); };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(".tilt") ?? null;
      if (el !== current) {
        reset(current);
        current = el;
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
    };
    const onLeave = () => { reset(current); current = null; };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); };
  }, []);
  return null;
}
