import Link from "next/link";
import { CARDS } from "@/game/data/cards";
import { connectDb } from "@/game/db";
import { leaderboard } from "@/game/services/player";
import { Page, coins } from "../components";
import { getUid } from "../lib/session";
import RankList from "./RankList";

const KINDS = ["coins", "level", "collection"] as const;

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const { by } = await searchParams;
  const kind = KINDS.find((k) => k === by) ?? "coins";
  await connectDb();
  const rows = await leaderboard(kind, 25);
  const fmt = (v: number) => (kind === "coins" ? coins(v) : kind === "level" ? `Lv ${v}` : `${v}/${CARDS.length}`);
  return (
    <Page title="🏆 Leaderboard">
      <div className="flex gap-2 text-sm">
        {KINDS.map((k) => (
          <Link key={k} href={`/leaderboard?by=${k}`} className={`rounded-full px-3 py-1 ${k === kind ? "bg-gold-500 text-plum-950" : "bg-plum-800"}`}>{k}</Link>
        ))}
      </div>
      <RankList kind={kind} me={await getUid()} rows={rows.map((r) => ({ id: r.discordId, name: `${r.username || "Unknown"}${r.title ? ` · 🏅 ${r.title}` : ""}`, value: fmt(r.value) }))} />
    </Page>
  );
}
