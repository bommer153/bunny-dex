import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config(); // fallback: apps/bot/.env if present

import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { connectDatabase } from "@bunnydex/database";
import { COMMAND_PREFIX, loadEnv } from "@bunnydex/config";
import { initGameEngine } from "@bunnydex/game";
import { handleCommand } from "./commands.js";

async function main() {
  const env = loadEnv();
  if (!env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN is required");
    process.exit(1);
  }

  await connectDatabase(env.MONGODB_URI);
  initGameEngine();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  const rate = new Map<string, number>();

  client.once(Events.ClientReady, (c) => {
    console.log(`BunnyDex bot ready as ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content) return;
    const content = message.content.trim();
    const prefix = COMMAND_PREFIX + " ";
    const alt = COMMAND_PREFIX;
    if (!content.toLowerCase().startsWith(prefix) && content.toLowerCase() !== alt) {
      return;
    }

    const now = Date.now();
    const last = rate.get(message.author.id) ?? 0;
    if (now - last < 750) return;
    rate.set(message.author.id, now);

    const body =
      content.toLowerCase() === alt ? "" : content.slice(COMMAND_PREFIX.length).trim();
    const args = body.length ? body.split(/\s+/) : ["help"];
    await handleCommand(message, args);
  });

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  if (message.includes("disallowed intents") || message.includes("Used disallowed intents")) {
    const appId = process.env.DISCORD_CLIENT_ID ?? "YOUR_APP_ID";
    console.error(`
============================================================
FIX: Enable Message Content Intent in Discord Developer Portal
1. Open: https://discord.com/developers/applications/${appId}/bot
2. Scroll to "Privileged Gateway Intents"
3. Turn ON "MESSAGE CONTENT INTENT" (toggle must be blue)
4. Click Save Changes
5. Run: pnpm bot
============================================================
`);
  }
  process.exit(1);
});
