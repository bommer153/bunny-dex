"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server-rendered page every `ms` while the tab is visible (keeps live data authoritative). */
export default function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}
