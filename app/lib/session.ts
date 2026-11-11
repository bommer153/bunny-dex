import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDb } from "@/game/db";
import { ensureUser } from "@/game/services/player";

/** Signed-in player's Discord id, or null. Also makes sure the DB is connected. */
export async function getUid() {
  await connectDb();
  const session = await auth();
  return session?.user?.discordId ?? null;
}

/** For pages and actions that need a player: redirects to sign-in otherwise. */
export async function requireUid() {
  const uid = await getUid();
  if (!uid) redirect("/api/auth/signin");
  const session = await auth();
  await ensureUser(uid, session?.user?.name ?? "");
  return uid;
}
