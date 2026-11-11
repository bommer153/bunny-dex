import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";

declare module "next-auth" {
  interface Session {
    user: { discordId: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
