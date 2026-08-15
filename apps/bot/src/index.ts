import "dotenv/config";
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
  console.error(err);
  process.exit(1);
});
