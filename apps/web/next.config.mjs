/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@bunnydex/game",
    "@bunnydex/database",
    "@bunnydex/config",
    "@bunnydex/types",
    "@bunnydex/validation",
    "@bunnydex/ui",
  ],
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;
