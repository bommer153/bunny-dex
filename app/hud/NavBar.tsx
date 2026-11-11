"use client";
// Grouped desktop nav + phone/tablet tab bar with a labelled "More" sheet (native popover: Esc / outside click close it).
// The current page is marked with aria-current, gold, and a gem, so it doesn't rely on colour alone.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { NAV_GROUPS, QUICK, isCurrent, type NavItem } from "./nav";

const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const ALL = NAV_GROUPS.flatMap((g) => g.items);

export function DesktopNav() {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  return (
    <nav aria-label="Main" className="hidden lg:flex flex-wrap items-end gap-x-4 gap-y-1 mx-auto max-w-6xl px-4 pb-2">
      {NAV_GROUPS.map((g) => (
        <div key={g.label} role="group" aria-labelledby={`nav-${g.label}`} className="flex flex-col gap-1">
          <span id={`nav-${g.label}`} className="flex items-center gap-1.5 pl-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-400/80">
            <span className="gem" aria-hidden /> {g.label}
          </span>
          <div className="flex gap-0.5">
            {g.items.map((it) => <NavLink key={it.href} item={it} current={isCurrent(it.href, pathname, hash)} />)}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavLink({ item, current, onClick }: { item: NavItem; current: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        current ? "bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/60" : "text-plum-300 hover:bg-plum-800 hover:text-plum-100"
      }`}
    >
      <span aria-hidden>{item.icon}</span>
      {item.label}
      {current && <span className="gem ml-0.5" aria-hidden />}
    </Link>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  const quick = QUICK.map((h) => ALL.find((i) => i.href === h)!);
  const moreCurrent = !quick.some((i) => isCurrent(i.href, pathname, hash)) && ALL.some((i) => isCurrent(i.href, pathname, hash));
  const close = () => document.getElementById("bd-more")?.hidePopover();
  return (
    <>
      <nav aria-label="Quick" className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gold-500/25 bg-plum-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {quick.map((it) => {
            const current = isCurrent(it.href, pathname, hash);
            return (
              <li key={it.href}>
                <Link href={it.href} aria-current={current ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${current ? "text-gold-300" : "text-plum-400"}`}>
                  <span className={`text-xl leading-none ${current ? "drop-shadow-[0_0_8px_rgb(240_177_42/0.8)]" : ""}`} aria-hidden>{it.icon}</span>
                  <span className="flex items-center gap-1">{current && <span className="gem" aria-hidden />}{it.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button popoverTarget="bd-more" aria-label="More sections" className={`flex w-full flex-col items-center gap-0.5 py-2 text-[11px] ${moreCurrent ? "text-gold-300" : "text-plum-400"}`}>
              <span className="text-xl leading-none" aria-hidden>☰</span>
              <span className="flex items-center gap-1">{moreCurrent && <span className="gem" aria-hidden />}More</span>
            </button>
          </li>
        </ul>
      </nav>
      <div id="bd-more" popover="auto" aria-label="All sections" className="fx-sheet m-0 mt-auto w-full max-w-none border-t border-gold-500/40 bg-plum-950 p-4 pb-24 text-plum-100 backdrop:bg-black/60 lg:hidden">
        <div className="mx-auto flex max-w-lg flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">All sections</p>
            <button popoverTarget="bd-more" popoverTargetAction="hide" className="rounded-md bg-plum-800 px-3 py-1 text-sm">Close</button>
          </div>
          {NAV_GROUPS.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400/80"><span className="gem" aria-hidden /> {g.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((it) => <NavLink key={it.href} item={it} current={isCurrent(it.href, pathname, hash)} onClick={close} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
