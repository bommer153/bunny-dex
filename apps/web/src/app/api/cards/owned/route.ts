import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { CardService } from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const cards = await CardService.getUserCards(String(user._id));
    return NextResponse.json({ cards: JSON.parse(JSON.stringify(cards)) });
  } catch (err) {
    return jsonError(err);
  }
}
