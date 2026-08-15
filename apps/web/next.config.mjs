import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: monorepoRoot,
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
