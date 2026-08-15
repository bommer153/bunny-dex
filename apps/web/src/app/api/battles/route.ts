import { NextResponse } from "next/server";
import { jsonError, requireDiscordId } from "@/lib/api";
import { BattleService } from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const battles = await BattleService.history(discordId, 20);
    return NextResponse.json({ battles: JSON.parse(JSON.stringify(battles)) });
  } catch (err) {
    return jsonError(err);
  }
}
