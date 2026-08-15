# BunnyDex

Discord-first collectible card game. **Discover. Collect. Battle.**

## Stack

- `apps/bot` — Discord.js prefix commands (`bd …`)
- `apps/web` — Next.js dashboard + Discord OAuth
- `packages/game` — shared authoritative game services
- `packages/database` — MongoDB / Mongoose models + seed
- `packages/types` · `validation` · `config` · `ui`

## Setup

```bash
pnpm install
cp .env.example .env
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, NEXTAUTH_SECRET, MONGODB_URI
pnpm db:seed
pnpm --filter @bunnydex/bot dev
pnpm --filter @bunnydex/web dev
```

## Deploy web to Vercel

1. Import the GitHub repo on Vercel
2. Set **Root Directory** to `apps/web`
3. Framework: Next.js (auto)
4. Add env vars (same as `.env`, use MongoDB Atlas URI — not localhost):
   - `MONGODB_URI`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `NEXTAUTH_URL` (your Vercel URL, e.g. `https://bunny-dex.vercel.app`)
   - `NEXTAUTH_SECRET`
   - `ADMIN_DISCORD_IDS` (optional)
5. In Discord Developer Portal → OAuth2 → Redirects, add:
   `https://YOUR-APP.vercel.app/api/auth/callback/discord`

The **Discord bot** does not run on Vercel (it needs a long-lived process). Run the bot on a VPS, Railway, Fly.io, or your PC.

## Architecture rule

Game logic lives only in `@bunnydex/game`. Discord commands and Next.js routes are thin adapters.
