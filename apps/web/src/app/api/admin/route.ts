import { NextResponse } from "next/server";
import { getAdminIds } from "@/lib/db";
import { jsonError, requireDiscordId } from "@/lib/api";
import {
  AdminService,
  CardCatalogService,
  ConfigService,
  EconomyService,
} from "@bunnydex/game";

export async function GET(): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    await AdminService.assertAdmin(discordId, getAdminIds());
    const [config, cards, audit, items] = await Promise.all([
      ConfigService.get(),
      CardCatalogService.list({ limit: 100 }),
      AdminService.listAudit(30),
      AdminService.listItems(),
    ]);
    return NextResponse.json({
      config,
      cards: JSON.parse(JSON.stringify(cards)),
      audit: JSON.parse(JSON.stringify(audit)),
      items: JSON.parse(JSON.stringify(items)),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const discordId = await requireDiscordId();
    const admins = getAdminIds();
    const body = await req.json();

    if (body.action === "config") {
      const config = await AdminService.patchConfig(discordId, body.values, admins);
      return NextResponse.json({ config });
    }
    if (body.action === "give_currency") {
      await AdminService.giveCurrency(
        discordId,
        body.targetDiscordId,
        body.currency,
        body.amount,
        admins,
      );
      return NextResponse.json({ ok: true });
    }
    if (body.action === "upsert_card") {
      const card = await AdminService.upsertCard(discordId, body.card, admins);
      return NextResponse.json({ card: JSON.parse(JSON.stringify(card)) });
    }
    if (body.action === "transactions") {
      const user = await AdminService.inspect(discordId, body.targetDiscordId, admins);
      const tx = await EconomyService.getHistory(String(user._id), 50);
      return NextResponse.json({ transactions: JSON.parse(JSON.stringify(tx)) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return jsonError(err);
  }
}
