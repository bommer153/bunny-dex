import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // app/api/card uses the bot's card renderer; discord.js has optional native deps the bundler can't resolve.
  serverExternalPackages: ["discord.js"],
  experimental: {
    // As a Discord Activity the site is served through Discord's proxy (<app id>.discordsays.com), so form actions arrive from there.
    serverActions: { allowedOrigins: ["*.discordsays.com"] },
  },
  async rewrites() {
    // Discord avatars through our own origin: the Activity sandbox blocks other hosts, and this works on the normal site too.
    return [{ source: "/discordcdn/:path*", destination: "https://cdn.discordapp.com/:path*" }];
  },
};

export default nextConfig;
