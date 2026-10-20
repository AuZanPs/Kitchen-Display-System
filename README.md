# Layar Dapur

A kitchen display system for restaurants. Waiters send orders from a tablet, the kitchen reads them on a TV and works them from a phone, and the owner runs everything from a browser. One deploy serves many kitchens ("dapur"), each on its own subdomain, plus a public site where owners sign in with an emailed link and a console for the super admin. It runs on Cloudflare Workers and Durable Objects; the sign-in email needs Workers Paid (Email Service).

The interface is in Indonesian, with an English toggle.

## Screens

| Path | Device | What it does |
|---|---|---|
| `/`, `/masuk`, `/akun` (bare domain) | any browser | Homepage with a live order demo; owner sign-in by email link; the owner's dapur and invited admins |
| `/super` (`console.` host) | laptop | Create dapur, set owner email and admin password, rename, switch on or off |
| `/enroll` | any new device | Shows a 6-digit code to pair the device |
| `/waiter` | tablet | Table, menu, item options, notes and allergies, review, send; table service with add items, move table, cancel request, served |
| `/kitchen` | phone | Accept (allergies must be confirmed), accept changes, confirm cancellations, mark ready, control the TV pages |
| `/tv` | TV, 1920×1080 | Read-only board in three lanes, pages that rotate when a lane is full, live/offline state |
| `/admin` | laptop or phone | Overview, menu and tables, staff PINs, device pairing, history with timeline and CSV/JSON export, settings |

## How it works

- One Durable Object (`VenueRoom`) per venue is the only writer and the WebSocket hub. Every change bumps a board `rev` and pushes the whole board to every open screen, so a screen that reconnects simply takes the latest board.
- Sockets use the hibernation API; idle connections and heartbeats cost nothing.
- Orders and commands carry an `operationId` (a retry never duplicates) and an `expectedVersion` (a stale screen cannot overwrite a newer change). The state machine lives in `src/shared/commands.ts`.
- Devices pair with a code the admin approves. The device token only travels in an HttpOnly cookie and only its hash is stored. Staff PINs are optional, per venue.
- The Worker checks the exact Origin on every write and socket, limits bodies to 64 KB and sends security headers; static pages get theirs from `public/_headers`.

## Develop

Requires Node 24 and pnpm 11.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD and a SESSION_SECRET of 64 hex characters
pnpm dev                         # http://localhost:5173
pnpm dev:lan                     # same, reachable from tablets on the Wi-Fi
```

Open `http://dapurku.localhost:5173/admin`, sign in, then open the app on each tablet, phone or TV and approve its code under **Perangkat**. To test several devices on one computer, use one browser profile per device. Delete `.wrangler/state` for fresh demo data.

```sh
pnpm check                              # TypeScript, Biome, Vitest (in workerd)
pnpm exec playwright install chromium   # once
pnpm e2e                                # full flow plus every screen at three widths, with axe
```

## Deploy

```sh
pnpm build
pnpm exec wrangler deploy
pnpm exec wrangler secret put SESSION_SECRET   # 64 hex characters
pnpm exec wrangler secret put ADMIN_PASSWORD
```

```sh
pnpm exec wrangler secret put SUPER_ADMIN_PASSWORD   # the console for every dapur
```

Database migrations run inside the Durable Object on first use. Without both secrets the admin console stays locked.

### Site, dapur and console

One deploy serves everything. The bare domain (`BASE_HOST` in `wrangler.jsonc`) is the public site, where owners sign in with an emailed link and open their dapur. Each dapur lives at `<address>.<BASE_HOST>` with its own data, devices and admin password; the first one is `dapurku`. The super admin creates dapur and sets their owner email at `console.<BASE_HOST>`. In Cloudflare, add a proxied DNS record for `*`, a Worker route `*.<BASE_HOST>/*`, and onboard the domain in Email Service so sign-in emails can go out (Workers Paid). Locally the same works on `localhost:5173`, `console.localhost:5173` and `<address>.localhost:5173`; the sign-in page shows the link instead of emailing it.

## Layout

- `src/shared` – Zod schemas and logic used by both sides (orders, commands, menu, board, staff, history)
- `src/worker` – Hono routes, the `VenueRoom` (one per dapur) and `Directory` Durable Objects, Drizzle schema and migrations
- `src/client` – React screens, i18n dictionaries, UI components
- `tests` – Vitest integration tests against the real Worker and Durable Object
- `e2e` – Playwright end-to-end tests

Third-party licences are listed in `THIRD_PARTY_LICENSES.md`.
