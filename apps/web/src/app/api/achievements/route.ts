import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { AchievementService } from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const achievements = await AchievementService.listForUser(String(user._id));
    return NextResponse.json({ achievements: JSON.parse(JSON.stringify(achievements)) });
  } catch (err) {
    return jsonError(err);
  }
}
