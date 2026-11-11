import { CONFIG } from "@/game/config";
import { getCard } from "@/game/data/cards";
import { Auction } from "@/game/models";
import { formatDuration, nextMinBid } from "@/game/rules";
import { listAuctions, usernames } from "@/game/services/market";
import { getUid } from "../lib/session";
import { auctionCancelAction } from "../actions";
import { CardTile, Flash, Page, button, coins, flashFrom, ghostButton, grid, input } from "../components";
import { Stamp } from "../fx/Burst";
import AutoRefresh from "../fx/AutoRefresh";
import AuctionLive from "./AuctionLive";

export default async function AuctionsPage({ searchParams }: PageProps<"/auctions">) {
  const uid = await getUid();
  // eslint-disable-next-line react-hooks/purity -- Server Component: renders once per request; this is the authoritative clock sent to the countdowns.
  const now = Date.now();
  const [auctions, closed] = await Promise.all([
    listAuctions({ limit: 40 }),
    Auction.find({ status: "settled", updatedAt: { $gte: new Date(now - 30 * 60_000) } }).sort({ updatedAt: -1 }).limit(8).lean(),
  ]);
  const names = await usernames([...auctions, ...closed].flatMap((a) => [a.sellerId, a.topBidderId]));
  const freshest = closed[0] && now - closed[0].updatedAt.getTime() < 30_000 ? closed[0] : null; // just closed: one stamp

  return (
    <Page title="🔨 Auctions">
      <AutoRefresh ms={15_000} />
      <Flash {...await flashFrom(searchParams)} />
      <p className="text-sm text-plum-400">
        Your bid is held until you&apos;re outbid, then refunded. Each bid must beat the top bid by {Math.round(CONFIG.auctionMinIncrement * 100)}%.
        A bid in the last {formatDuration(CONFIG.auctionAntiSnipeMs)} extends the auction. Start one from your collection or with{" "}
        <code>bd auction start</code>.
      </p>
      {auctions.length === 0 && <p className="text-plum-500">No auctions running.</p>}
      <div className={grid}>
        {auctions.map((a, i) => (
          <CardTile key={a.code} slug={a.slug} variant={a.variant} level={a.level} index={i} tilt>
            <AuctionLive
              code={a.code} topBid={a.topBid} minBid={a.minBid} nextMin={nextMinBid(a)} bids={a.bids} buyout={a.buyout ?? undefined}
              endsAt={a.endsAt.getTime()} serverNow={now} seller={names.get(a.sellerId) ?? "?"} topBidder={a.topBidderId ? names.get(a.topBidderId) : undefined}
              mine={uid === a.sellerId} winning={!!uid && uid === a.topBidderId} signedIn={!!uid} canCancel={uid === a.sellerId && a.bids === 0}
              cancel={
                <form action={auctionCancelAction}>
                  <input type="hidden" name="code" value={a.code} />
                  <button className={`${ghostButton} w-full`}>Cancel auction</button>
                </form>
              }
              inputClass={input} buttonClass={button} ghostClass={ghostButton}
            />
          </CardTile>
        ))}
      </div>

      {closed.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Recently closed</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {closed.map((a) => (
              <li key={a.code} className={`rounded-lg bg-plum-900 px-3 py-2 ${a === freshest ? "fx-highlight" : ""}`}>
                🔨 {getCard(a.slug).name} ·{" "}
                {a.bids ? <>sold to <strong>{names.get(a.topBidderId!) ?? "?"}</strong> for {coins(a.topBid)}</> : "no bids, returned to the seller"}
              </li>
            ))}
          </ul>
          {freshest && <Stamp text={freshest.bids ? "Sold!" : "No sale"} tone={freshest.bids ? "seal" : "grey"} />}
        </section>
      )}
    </Page>
  );
}
