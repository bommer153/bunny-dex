import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";

declare module "next-auth" {
  interface Session {
    user: { discordId: string } & DefaultSession["user"];
  }
}

// The session cookie must also work when the site runs as a Discord Activity (inside Discord's iframe on *.discordsays.com).
// Embedded = third-party context, so the cookie needs SameSite=None + Secure + Partitioned (CHIPS). Locally (http) keep the default.
const secure = process.env.NODE_ENV === "production"; // browsers also accept Secure cookies on http://localhost
export const SESSION_COOKIE = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
export const SESSION_COOKIE_OPTIONS = secure
  ? { httpOnly: true, sameSite: "none" as const, path: "/", secure: true, partitioned: true }
  : { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false };

export const { handlers, auth, signIn, signOut } = NextAuth({
  cookies: { sessionToken: { name: SESSION_COOKIE, options: SESSION_COOKIE_OPTIONS } },
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Discord now returns `iss` on the callback; without this Auth.js expects its placeholder "https://authjs.dev" and rejects the login.
      issuer: "https://discord.com",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  callbacks: {
    jwt({ token, account, profile }) {
      if (account) {
        token.discordId = account.providerAccountId; // the player's Discord user id
        token.username = (profile as { username?: string } | undefined)?.username;
      }
      return token;
    },
    session({ session, token }) {
      session.user.discordId = token.discordId as string;
      return session;
    },
  },
});
