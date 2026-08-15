import { connectDatabase } from "@bunnydex/database";
import { loadEnv, parseAdminIds } from "@bunnydex/config";
import { initGameEngine } from "@bunnydex/game";

let ready: Promise<void> | null = null;

export async function ensureDb() {
  if (!ready) {
    ready = (async () => {
      const env = loadEnv(process.env);
      await connectDatabase(env.MONGODB_URI);
      initGameEngine();
    })();
  }
  await ready;
}

export function getAdminIds() {
  return parseAdminIds(process.env.ADMIN_DISCORD_IDS ?? "");
}
