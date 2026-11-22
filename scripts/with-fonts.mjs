// Runs a command with FONTCONFIG_FILE set from process start, so card pictures (bot/grid.ts) find the bot's Geist font.
// On Windows the image library only sees environment variables that exist when the process starts; grid.ts setting it
// at runtime works on Linux only. Usage: node scripts/with-fonts.mjs next dev
import { spawn } from "node:child_process";
import path from "node:path";

const env = { ...process.env, FONTCONFIG_FILE: process.env.FONTCONFIG_FILE ?? path.resolve("bot", "fonts", "fonts.conf") };
const child = spawn(process.argv.slice(2).join(" "), { stdio: "inherit", shell: true, env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
