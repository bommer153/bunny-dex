import { NextResponse } from "next/server";
import { jsonError, requireDiscordId } from "@/lib/api";
import { DeckService } from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const decks = await DeckService.list(discordId);
    return NextResponse.json({ decks: JSON.parse(JSON.stringify(decks)) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const body = await req.json();
    if (body.action === "create") {
      const deck = await DeckService.create(discordId, body.name);
      return NextResponse.json({ deck: JSON.parse(JSON.stringify(deck)) });
    }
    if (body.action === "use") {
      const deck = await DeckService.setActive(discordId, body.name);
      return NextResponse.json({ deck: JSON.parse(JSON.stringify(deck)) });
    }
    if (body.action === "add") {
      const deck = await DeckService.addCard(discordId, body.name, body.userCardId);
      return NextResponse.json({ deck: JSON.parse(JSON.stringify(deck)) });
    }
    if (body.action === "remove") {
      const deck = await DeckService.removeCard(discordId, body.name, body.userCardId);
      return NextResponse.json({ deck: JSON.parse(JSON.stringify(deck)) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return jsonError(err);
  }
}
