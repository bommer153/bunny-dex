import { NextResponse } from "next/server";
import { jsonError, requireDiscordId } from "@/lib/api";
import { UserService } from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const user = await UserService.getProfile(discordId);
    return NextResponse.json({ user: JSON.parse(JSON.stringify(user)) });
  } catch (err) {
    return jsonError(err);
  }
}
