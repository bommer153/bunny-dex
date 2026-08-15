import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { UserService } from "@bunnydex/game";
import { ensureDb } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, profile }) {
      await ensureDb();
      const p = profile as {
        id?: string;
        username?: string;
        global_name?: string;
        image_url?: string;
      };
      const discordId = p.id ?? user.id;
      if (!discordId) return false;
      await UserService.getOrCreateFromDiscord({
        discordId,
        username: p.username ?? user.name ?? "unknown",
        displayName: p.global_name ?? user.name ?? "Player",
        avatarUrl: user.image ?? undefined,
      });
      return true;
    },
    async jwt({ token, profile }) {
      if (profile && "id" in profile) {
        token.discordId = (profile as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { discordId?: string }).discordId = token.discordId as string;
      }
      return session;
    },
  },
};
