"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Played } from "../actions";

/**
 * One handler run at a time: clicks that arrive while the previous run is still going are ignored synchronously
 * (before React re-renders), so a double click can't start a second set of effects.
 */
export function useLock() {
  const locked = useRef(false);
  return useCallback((fn: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    void fn().finally(() => { locked.current = false; });
  }, []);
}

/**
 * Wraps a confirmed-result server action for a scene:
 * - one request at a time (double clicks are ignored, so a mutation never runs twice from one click burst);
 * - results that arrive after unmount or after a newer request are dropped (null), so no stale result is shown;
 * - network failures become a normal error result.
 */
export function useConfirmed<A extends unknown[], T>(action: (...a: A) => Promise<Played<T>>) {
  const busy = useRef(false);
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  return useCallback(
    async (...a: A): Promise<Played<T> | null> => {
      if (busy.current) return null;
      busy.current = true;
      const id = ++seq.current;
      try {
        const r = await action(...a);
        return alive.current && id === seq.current ? r : null;
      } catch {
        return alive.current ? { ok: false, error: "Couldn't reach the server. Check your connection and try again." } : null;
      } finally {
        busy.current = false;
      }
    },
    [action],
  );
}
