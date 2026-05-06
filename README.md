# SVU Status

Public status page for Syrian Virtual University online services.

The site is a static Vite + React app that reads generated status data from JSON. A scheduled GitHub Actions workflow checks the configured services every hour, stores the latest status history on the `status-data` branch, and lets the deployed static site fetch that data without a backend.

Repository: https://github.com/shadi-almilhem/svustatus

## Features

- Arabic and English interface with RTL support.
- Public reachability checks for SVUIS, LMS, mail, the main website, and the requests system.
- 45-day uptime history rendered with OpenStatus-compatible status bars.
- Local Thmanyah Sans font files for fast loading and consistent Arabic rendering.
- Static deployment friendly: the app only needs `dist` plus a public JSON data URL.
- Hourly checks through GitHub Actions, with manual workflow dispatch support.

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

By default, local development reads `public/status.json`. To read status data from another URL, create an `.env.local` file:

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

## GitHub Actions

`.github/workflows/status-check.yml` runs:

- on `workflow_dispatch`
- hourly at minute 17
- at minute 47 as a guarded backup

The workflow:

1. Checks whether the latest `status-data/status.json` is stale.
2. Skips the backup run when the data is still fresh.
3. Restores or creates the `status-data` branch.
4. Runs `scripts/check-status.mjs`.
5. Writes `status.json`.
6. Pushes only `status.json` back to `status-data`.

The workflow needs `contents: write`, which is already declared in the workflow file.

The primary cron expression is `17 * * * *`, which is hourly. GitHub scheduled
workflows can occasionally be delayed or skipped, so the guarded backup entry
keeps the status data close to hourly without running duplicate checks every
30 minutes.

## Deployment

For Cloudflare Pages or any static host:

- Build command: `npm run build`
- Build output directory: `dist`
- Production environment variable: `VITE_STATUS_DATA_URL=https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/status.json`

The repository or the generated JSON URL must remain public. The current GitHub repository is public, so unauthenticated visitors can access both the repo page and the raw `status-data` JSON.

This repo also includes `.github/workflows/pages-deploy.yml`, which deploys to
Cloudflare Pages whenever code is pushed to `main`. The workflow uses
`cloudflare/wrangler-action` and uploads the `dist` folder to the Pages project
defined in `wrangler.toml`.

Required GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token must be allowed to edit Cloudflare Pages for the account that owns
the `svustatus` Pages project. Do not commit Cloudflare tokens to `.env` files.

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
