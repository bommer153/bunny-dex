import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { DomainError, UserService } from "@bunnydex/game";

export async function getSessionDiscordId() {
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { discordId?: string } | undefined)?.discordId;
  if (!discordId) return null;
  return discordId;
}

export function jsonError(err: unknown) {
  if (err instanceof DomainError) {
    return NextResponse.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 400 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export async function requireDiscordId() {
  await ensureDb();
  const discordId = await getSessionDiscordId();
  if (!discordId) {
    throw new DomainError("FORBIDDEN", "Sign in with Discord first.");
  }
  return discordId;
}

export async function requireUser() {
  const discordId = await requireDiscordId();
  return UserService.requireByDiscordId(discordId);
}
