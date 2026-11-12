// Discord Activity login. Inside Discord the normal OAuth redirect can't run (it's an iframe), so the Embedded App SDK
// gives the page an OAuth `code`; we exchange it here, look up who it is, and set the same session cookie Auth.js uses.
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/auth";
import { connectDb } from "@/game/db";
import { ensureUser } from "@/game/services/player";

const MAX_AGE = 30 * 24 * 60 * 60; // Auth.js default session length

export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  if (typeof code !== "string" || !code || code.length > 200) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? "",
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!tokenRes.ok) {
    console.error("[activity] token exchange failed", tokenRes.status, await tokenRes.text().catch(() => ""));
    return NextResponse.json({ error: "Discord rejected the login." }, { status: 401 });
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) return NextResponse.json({ error: "Couldn't read your Discord profile." }, { status: 401 });
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null };

  await connectDb();
  await ensureUser(me.id, me.username);

  // Same token shape as the web login (see auth.ts callbacks), so auth() can't tell the two apart.
  const session = await encode({
    salt: SESSION_COOKIE,
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: MAX_AGE,
    token: {
      sub: me.id,
      discordId: me.id,
      username: me.username,
      name: me.global_name || me.username,
      picture: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null,
    },
  });
  const res = NextResponse.json({ access_token }); // the SDK needs it for commands.authenticate
  res.cookies.set(SESSION_COOKIE, session, { ...SESSION_COOKIE_OPTIONS, maxAge: MAX_AGE });
  return res;
}
