# SVU Status

Public status page for Syrian Virtual University online services.

The site is a static Vite + React app that reads generated status data from JSON. A scheduled GitHub Actions workflow checks the configured services every hour, stores the latest status history on the `status-data` branch, and lets the deployed static site fetch that data without a backend.

Repository: https://github.com/shadi-almilhem/svustatus

## Features

- Arabic and English interface with RTL support.
- Public reachability checks for SVUIS, LMS, mail, the main website, and the requests system.
- 45-day uptime history rendered with OpenStatus-compatible status bars.
- Shareable service links like `/lms` and `/svuis` with live Open Graph images.
- One-time browser recovery notifications for services that are currently down.
- Local Thmanyah Sans font files for fast loading and consistent Arabic rendering.
- Static-first deployment with Cloudflare Pages Functions for status JSON, OG images, and notification registration.
- Dependable hourly checks through a Cloudflare Worker Cron Trigger, with a twice-hourly GitHub Actions fallback for the legacy `status-data` branch.

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS v4
- shadcn/ui registry blocks
- GitHub Actions

## Getting Started

Install dependencies:

```bash
npm install
```

Generate or refresh local status data:

```bash
npm run check:status
```

Start the development server:

```bash
npm run dev
```

By default, local development reads `public/status.json`. Production reads `/api/status`, which uses Cloudflare KV when configured. To read status data from another URL locally, create an `.env.local` file:

```bash
VITE_STATUS_DATA_URL=https://raw.githubusercontent.com/<owner>/<repo>/status-data/status.json
```

## Scripts

```bash
npm run dev           # Start Vite locally
npm run build         # Type-check and build production assets
npm run lint          # Run ESLint
npm run test          # Run Vitest tests
npm run check:status  # Run monitor checks and write public/status.json
```

## Monitor Configuration

Services are defined in `monitor.config.json`.

Each monitor needs:

- `id`: stable machine-readable identifier.
- `name.en`: English display name.
- `name.ar`: Arabic display name.
- `url`: public URL to check.

The checker treats HTTP `2xx` and `3xx` responses as reachable. It uses the configured timeout, retries failed checks, keeps hourly history, and rolls that history into daily uptime data for the UI.

## Status Data

The generated JSON contains:

- `generatedAt`: timestamp of the latest check run.
- `timezone`: display timezone.
- `monitors`: current monitor states, localized names, latest result, uptime, and daily bars.
- `incidents`: incident history derived from downtime.
- `history`: hourly check history used to build the daily summary.

Production is configured in `.env.production`:

```bash
VITE_STATUS_DATA_URL=https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/status.json
```

## Cloudflare Runtime

Production uses three Cloudflare pieces:

- Cloudflare Pages + Pages Functions for the React app, `/api/status`, `/api/watch`, `/api/push-config`, service route meta injection, and `/og/<service>.jpg`.
- A separate Worker from `wrangler.status.toml` that wakes every five minutes,
  performs a check when the latest measurement is at least 55 minutes old, and
  retries automatically after a missed or failed run.
- A private service-bound Worker from `wrangler.og.toml` that renders the
  request-generated card as a real JPEG.

OG cards are generated on demand. No generated card files are stored in the
repository, KV, R2, or the `status-data` branch. The Pages Function reads the
current monitor data and calls the private renderer through the `OG_RENDERER`
service binding. The renderer converts text to font outlines, rasterizes the
card in memory, and uses Cloudflare Images for the final 1200 x 630 JPEG output.

On every run, the Worker merges the public `status-data` branch with KV before
adding the new measurement. That preserves older checks collected by the GitHub
fallback, repairs historical gaps when either store has data, and deduplicates
records by check timestamp.

Create the Cloudflare resources:

```bash
npx wrangler kv namespace create STATUS_KV
npx wrangler d1 create svustatus-watch
npx wrangler d1 migrations apply svustatus-watch
```

Then copy the returned KV namespace ID and D1 database ID into `wrangler.status.toml`. Configure the same `STATUS_KV` and `WATCH_DB` bindings for the Pages project in the Cloudflare dashboard or uncomment/fill the binding blocks in `wrangler.toml`.

Generate VAPID keys for Web Push:

```bash
npx web-push generate-vapid-keys
npx wrangler secret put VAPID_PRIVATE_KEY --config wrangler.status.toml
```

Add `VAPID_PUBLIC_KEY` to the `[vars]` section for both `wrangler.toml` and `wrangler.status.toml`, because `/api/push-config` exposes the public key to browsers and the scheduled Worker needs the same public key when signing push messages. `VAPID_PRIVATE_KEY` must stay only on the scheduled Worker secret.

Deploy the scheduled checker and the private OG renderer:

```bash
npx wrangler deploy --config wrangler.status.toml
npx wrangler deploy --config wrangler.og.toml
```

## GitHub Actions

`.github/workflows/status-check.yml` is now a legacy fallback for the `status-data` branch. It runs:

- on `workflow_dispatch`
- every 30 minutes

The workflow:

1. Checks whether the latest `status-data/status.json` is stale.
2. Skips runs when the data is still fresh.
3. Restores or creates the `status-data` branch.
4. Runs `scripts/check-status.mjs`.
5. Writes `status.json`.
6. Pushes only `status.json` back to `status-data`.

The workflow needs `contents: write`, which is already declared in the workflow file.

The production checker is the Cloudflare Worker Cron Trigger in
`wrangler.status.toml`. The GitHub workflow remains useful as a public fallback
for local development, static mirrors, or manual recovery.

## Deployment

For Cloudflare Pages or any static host:

- Build command: `npm run build`
- Build output directory: `dist`
- Production environment variable: `VITE_STATUS_DATA_URL=/api/status`

The repository or the generated JSON URL should remain public for fallback use. Production status reads from Cloudflare KV through `/api/status`; the raw `status-data` JSON remains a backup source.

This repo also includes `.github/workflows/pages-deploy.yml`, which deploys the
private OG renderer first, then Cloudflare Pages, and finally the hourly status
Worker whenever code is pushed to `main`. The workflow uses
`cloudflare/wrangler-action`, uploads `dist` to the Pages project defined in
`wrangler.toml`, and deploys both Worker configurations so their bindings and
code stay in sync.

Required GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token must be allowed to edit Cloudflare Pages and Workers Scripts for
the account that owns the `svustatus` Pages project, `svustatus-cron` Worker,
and `svustatus-og-renderer` Worker.
Do not commit Cloudflare tokens to `.env` files.

## Fonts

The app uses local Thmanyah Sans WOFF2 files from:

```text
src/fonts/thmanyahsans/woff2/
```

Only the weights used by the UI are kept:

- Regular
- Medium
- Bold

No external web font stylesheet is required.

## Customization

To add a service, edit `monitor.config.json`, then run:

```bash
npm run check:status
npm run build
```

To change copy or locale labels, edit `src/lib/status-i18n.ts`.

To change the visual theme, update `src/index.css` and `components.json`. The current shadcn preset is configured with the base Maia style, mist base color, RTL support, pointer cursor behavior, and zero shadow utilities.

## Public Links

- Repository: https://github.com/shadi-almilhem/svustatus
- Status data: https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/status.json
- Author: https://shadialmilhem.com
