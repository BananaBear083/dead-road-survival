# Dead Road Survival

A 2D zombie survival game built with Next.js and
[vinext](https://github.com/cloudflare/vinext).

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Project Structure

- edit site code under `app/`
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## GitHub Pages

Pushes to `main` build a static export and deploy it with GitHub Actions. Before
the first deployment, set the repository's Pages source to **GitHub Actions** in
**Settings → Pages**.

The workflow supports both `owner.github.io` repositories and project sites
served below `/<repository>/`.

## Local co-op survival

The main menu includes a **双人生存** entry for local same-screen play. Player
1 uses keyboard and mouse. Player 2 uses the first connected standard USB or
Bluetooth gamepad:

- left stick: move
- right stick: aim
- right trigger (`RT`): fire or attack
- `X`: reload
- `Y`: switch weapon
- right bumper (`RB`): kick

Both players use the same survival character, weapon, animation, reload, sound,
damage, and zombie systems, while keeping independent health and ammunition.
Co-op survival spawns exactly twice the single-player zombie total each day.
Connect the gamepad before starting the mode and press any gamepad button if the
browser has not detected it yet.

## Player accounts and cloud saves

The game supports optional email/password accounts backed by Supabase. Guest
play continues to use browser storage. On the first successful login, local and
cloud progress are merged so cleared levels and earned unlocks are not lost.
Guest progress and each signed-in player's local cache are kept in separate
namespaces, preventing account switches on a shared browser from mixing saves.

### 1. Create the Supabase project

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Open the SQL Editor and run
   [`supabase/migrations/202607220001_create_game_saves.sql`](supabase/migrations/202607220001_create_game_saves.sql).
3. Under **Authentication → URL Configuration**, set the Site URL to
   `https://bananabear083.github.io/dead-road-survival/` and add the same URL to
   the allowed redirect URLs.
4. Keep email/password authentication enabled. Email confirmation can remain
   enabled for production accounts.

The migration enables Row Level Security. Authenticated players can only read
and write the row whose `user_id` matches their account.

### 2. Configure local development

Copy `.env.example` to `.env.local`, then fill in the project URL and the
project's publishable key:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

The publishable key is designed for browser use. Never add a Supabase secret or
`service_role` key to this project.

### 3. Configure GitHub Pages

In **GitHub → Settings → Secrets and variables → Actions**, create these
repository secrets:

- `SUPABASE_URL`: the Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY`: the Supabase publishable key

Run the **Deploy site to GitHub Pages** workflow again. The header account
button will then allow players to register, log in, merge an existing local
save, manually sync, and log out. New local saves are uploaded automatically
while the player is signed in.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
