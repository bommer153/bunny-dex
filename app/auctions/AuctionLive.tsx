"use client";
// Live auction card body: server-anchored countdown, bid with confirmed-amount count-up and highlight,
// a hammer "closing" state at zero, and a SOLD stamp for an instant buyout.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bidPlay } from "../actions";
import { CountUp, Stamp } from "../fx/Burst";
import { useConfirmed, useLock } from "../fx/useConfirmed";

type Props = {
  code: string; topBid: number; minBid: number; nextMin: number; bids: number; buyout?: number; endsAt: number; serverNow: number;
  seller: string; topBidder?: string; mine: boolean; winning: boolean; signedIn: boolean; canCancel: boolean; cancel?: React.ReactNode;
  inputClass: string; buttonClass: string; ghostClass: string;
};

function left(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s % 60}s`;
}

export default function AuctionLive(p: Props) {
  const router = useRouter();
  const bid = useConfirmed(bidPlay);
  const lock = useLock();
  const [now, setNow] = useState(p.serverNow);
  const [mineNow, setMine] = useState<{ topBid: number; bids: number; endsAt: number; nextMin: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(0);
  const [sold, setSold] = useState(false);
  const offset = useRef(0);

  // Bids only go up and anti-snipe only extends, so the larger of server props and our own confirmed bid is current.
  const topBid = Math.max(p.topBid, mineNow?.topBid ?? 0);
  const bids = Math.max(p.bids, mineNow?.bids ?? 0);
  const endsAt = Math.max(p.endsAt, mineNow?.endsAt ?? 0);
  const nextMin = Math.max(p.nextMin, mineNow?.nextMin ?? 0);
  const remaining = endsAt - now;
  const ended = remaining <= 0 || sold;

  // Countdown anchored to the server clock (the server decides when it really ends).
  useEffect(() => {
    offset.current = p.serverNow - Date.now();
    const t = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(t);
  }, [p.serverNow]);

  // At zero: keep asking the server until it settles the auction (it then leaves this list).
  useEffect(() => {
    if (!ended) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [ended, router]);

  async function submit(e: FormEvent<HTMLFormElement>, amount: number) {
    e.preventDefault();
    if (!p.signedIn) return router.push("/api/auth/signin");
    setPending(true);
    setError("");
    const r = await bid(p.code, amount);
    setPending(false);
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setMine({ topBid: r.data.topBid, bids: r.data.bids, endsAt: r.data.endsAt, nextMin: r.data.nextMin });
    setFlash((n) => n + 1);
    if (r.data.isBuyout || r.data.settled) {
      setSold(true);
      setTimeout(() => router.refresh(), 1600);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div key={flash} className={`rounded-lg px-2 py-1 text-sm ${flash ? "fx-highlight" : ""}`}>
        <div className="text-[10px] uppercase tracking-wider text-plum-400">{bids ? "Current bid" : "Starting bid"}</div>
        <div className="text-xl font-bold text-gold-300">🪙 {bids ? <CountUp value={topBid} /> : p.minBid.toLocaleString()}</div>
        <div className="text-xs text-plum-400">
          {bids ? `${bids} bid${bids > 1 ? "s" : ""}` : "No bids yet"}
          {(mineNow || p.winning) && bids ? <strong className="text-gold-200"> · ◆ you&apos;re winning</strong> : p.topBidder && bids ? ` · top: ${p.topBidder}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
          {ended ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold-500/60 px-2 py-0.5 text-gold-200"><span className="fx-gavel" aria-hidden>🔨</span> Closing…</span>
          ) : (
            <span className={`rounded-full border px-2 py-0.5 tabular-nums ${remaining < 60_000 ? "border-red-400/70 text-red-300" : "border-plum-600 text-plum-200"}`}>
              {remaining < 60_000 ? "⏰" : "⏳"} {left(remaining)}
            </span>
          )}
          <span className="text-plum-500">by {p.seller}</span>
        </div>
        {p.buyout && <div className="mt-1 text-xs text-emerald-300">Buy now 🪙 {p.buyout.toLocaleString()}</div>}
      </div>
      {!ended && !p.mine && (
        <form onSubmit={(e) => { e.preventDefault(); const n = Number(new FormData(e.currentTarget).get("amount")); lock(() => submit(e, n)); }} className="flex gap-1">
          <input key={nextMin} name="amount" type="number" min={nextMin} defaultValue={nextMin} required aria-label="Bid amount" className={p.inputClass} />
          <button className={p.buttonClass} disabled={pending} aria-busy={pending}>{pending ? <span className="spinner" aria-label="Bidding" /> : p.signedIn ? "Bid" : "Sign in"}</button>
        </form>
      )}
      {!ended && !p.mine && p.buyout && (
        <form onSubmit={(e) => { e.preventDefault(); lock(() => submit(e, p.buyout!)); }}>
          <button className={`${p.ghostClass} w-full`} disabled={pending}>Buy now</button>
        </form>
      )}
      {!ended && p.canCancel && p.cancel}
      {error && <p role="alert" className="text-xs text-red-300 anim-shake">❌ {error}</p>}
      {sold && <Stamp text="Sold!" tone="seal" />}
    </div>
  );
}
