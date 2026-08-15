import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { jsonError, requireDiscordId } from "@/lib/api";
import { MarketplaceService } from "@bunnydex/game";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureDb();
    const sp = req.nextUrl.searchParams;
    if (sp.get("mine") === "1") {
      const discordId = await requireDiscordId();
      const listings = await MarketplaceService.listMine(discordId);
      return NextResponse.json({ listings: JSON.parse(JSON.stringify(listings)) });
    }
    const listings = await MarketplaceService.search({
      q: sp.get("q") ?? undefined,
      rarity: sp.get("rarity") ?? undefined,
      element: sp.get("element") ?? undefined,
      limit: 50,
    });
    return NextResponse.json({ listings: JSON.parse(JSON.stringify(listings)) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const body = await req.json();
    if (body.action === "sell") {
      const listing = await MarketplaceService.sellCard(
        discordId,
        body.userCardId,
        body.priceCoins,
      );
      return NextResponse.json({ listing: JSON.parse(JSON.stringify(listing)) });
    }
    if (body.action === "buy") {
      const result = await MarketplaceService.buy(discordId, body.listingId);
      return NextResponse.json(JSON.parse(JSON.stringify(result)));
    }
    if (body.action === "cancel") {
      const listing = await MarketplaceService.cancel(discordId, body.listingId);
      return NextResponse.json({ listing: JSON.parse(JSON.stringify(listing)) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return jsonError(err);
  }
}
