import { NextResponse } from "next/server";
import { jsonError, requireDiscordId } from "@/lib/api";
import { CollectionService } from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const progress = await CollectionService.getProgress(discordId);
    return NextResponse.json(JSON.parse(JSON.stringify(progress)));
  } catch (err) {
    return jsonError(err);
  }
}
