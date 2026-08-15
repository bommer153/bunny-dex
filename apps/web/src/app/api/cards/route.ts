import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { CardCatalogService } from "@bunnydex/game";
import type { Element, Rarity } from "@bunnydex/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureDb();
    const sp = req.nextUrl.searchParams;
    const cards = await CardCatalogService.list({
      q: sp.get("q") ?? undefined,
      rarity: (sp.get("rarity") as Rarity) ?? undefined,
      element: (sp.get("element") as Element) ?? undefined,
      setId: sp.get("setId") ?? undefined,
    });
    return NextResponse.json({ cards: JSON.parse(JSON.stringify(cards)) });
  } catch (err) {
    return jsonError(err);
  }
}
