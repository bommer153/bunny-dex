import type { ReactNode } from "react";
import { WIKI_NAV } from "@/lib/wiki";

export default function WikiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <aside className="h-fit rounded-2xl border border-meadow-700/60 bg-meadow-900/50 p-4 lg:sticky lg:top-6">
        <p className="font-display text-lg text-meadow-400">Wiki</p>
        <p className="mt-1 text-xs text-meadow-100/50">Discover. Collect. Battle.</p>
        <nav className="mt-4 flex flex-col gap-1 text-sm">
          {WIKI_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-meadow-100/80 transition hover:bg-meadow-700/40 hover:text-meadow-400"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
