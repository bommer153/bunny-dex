import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { LeaderboardService } from "@bunnydex/game";
import type { LeaderboardKind } from "@bunnydex/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureDb();
    const kind = (req.nextUrl.searchParams.get("kind") ?? "wealth") as LeaderboardKind;
    const rows = await LeaderboardService.get(kind);
    return NextResponse.json({ rows });
  } catch (err) {
    return jsonError(err);
  }
}
