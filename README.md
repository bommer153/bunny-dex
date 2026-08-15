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

## Architecture rule

Game logic lives only in `@bunnydex/game`. Discord commands and Next.js routes are thin adapters.
