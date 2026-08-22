# Now Spinning — Vinyl Scrobbler

[![CI](https://github.com/rick-roche/now-spinning/actions/workflows/ci.yml/badge.svg)](https://github.com/rick-roche/now-spinning/actions/workflows/ci.yml) [![Deploy](https://github.com/rick-roche/now-spinning/actions/workflows/deploy.yml/badge.svg)](https://github.com/rick-roche/now-spinning/actions/workflows/deploy.yml)

<p align="center">
  <img src="apps/web/public/now-spinning-logo.svg" alt="Now Spinning logo" width="520" />
</p>

A mobile-first app for scrobbling vinyl listening sessions to [last.fm](https://www.last.fm/).

Connect your [last.fm](https://www.last.fm/) and [Discogs](https://www.discogs.com/) accounts and then

- Pick a record from your [Discogs](https://www.discogs.com/) collection
- Tap **Start Scrobbling**, and let the app scrobble each track as you listen.

Deployed version running at [https://now-spinning.apps.rickroche.com](https://now-spinning.apps.rickroche.com/).

## Documentation

- **[SPEC.md](SPEC.md)** — Full product specification
- **[AGENTS.md](AGENTS.md)** — Agent workflow and responsibilities
- **[PLAN.md](PLAN.md)** — Current implementation plan and progress

---

## Prerequisites

- **Node.js** 22.13 or later ([nvm](https://github.com/nvm-sh/nvm) recommended)
- **pnpm** 11.1.2 or later

Install pnpm globally if needed:

```bash
npm install -g pnpm@11.1.2
```

---

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start local development

Copy `.env.example` to `.env` and provide the provider credentials. Secrets are loaded by the Node server only.

Generate the required local token-encryption key with:

```bash
openssl rand -base64 32
```

Set the result as `TOKEN_ENCRYPTION_KEY`. Keep the same key across restarts; losing it makes encrypted OAuth tokens unrecoverable.

Note: These are required before OAuth flows will work.

- LASTFM_API_KEY
- LASTFM_API_SECRET
- DISCOGS_CONSUMER_KEY
- DISCOGS_CONSUMER_SECRET

This runs both the SPA and Node server concurrently:

```bash
pnpm dev
```

- **SPA:** http://localhost:5173
- **Server API:** http://localhost:3000
- **Health check:** http://localhost:5173/api/health

The SPA proxies `/api/*` requests to the Node server automatically.

### 3. Verify it works

Open http://localhost:5173 in your browser.

### Docker

For a local production-like container, configure `.env` and run:

```bash
docker compose -f compose.yaml -f compose.local.yaml up --build
```

The app is available at http://localhost:3000 and stores SQLite data in the named `now-spinning-data` volume. Compose is local/provider-portable tooling only. Production is a Coolify **Application** built from the repository root `/Dockerfile`, exposing port `3000`, mounting `/data`, and running exactly one replica.

### Coolify deployment

Coolify connects to this repository through its GitHub App and builds the root Dockerfile directly. Production deploys are triggered by the successful `CI` workflow through the authenticated Coolify webhook; disable Coolify automatic main-branch deploys to avoid duplicate builds. Pull Request previews are enabled for trusted contributors only and use isolated storage rather than the production `/data` volume.

See [docs/deployment.md](docs/deployment.md) for the exact production, preview, DNS, environment, persistence, and rollback configuration.

---

## Available commands

All commands run from the **workspace root**:

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm dev`         | Start SPA + Node server in dev mode      |
| `pnpm build`       | Build all workspaces for production      |
| `pnpm test`        | Run all tests (Vitest)                   |
| `pnpm test:e2e`    | Run Playwright smoke tests (web)         |
| `pnpm typecheck`   | Typecheck all workspaces                 |
| `pnpm lint`        | Lint code with ESLint                    |
| `pnpm lint:fix`    | Auto-fix linting issues                  |
| `pnpm knip`        | Check for dead code/config drift         |
| `pnpm validate`    | Run lint, typecheck, test, knip, build   |
| `pnpm clean`       | Clean build artifacts                    |

### Per-workspace commands

You can also run commands in individual workspaces:

```bash
# In the web app
pnpm -C apps/web dev
pnpm -C apps/web build
pnpm -C apps/web test:e2e

# In the worker
pnpm -C apps/server dev
pnpm -C apps/server build

# In shared package
pnpm -C packages/shared test
```

## Project structure

```
now-spinning/
├── apps/
│   ├── web/           # React/Vite SPA
│   └── server/        # Hono API and scheduler on Node.js
├── packages/
│   └── shared/        # Shared types + pure logic
├── .github/
│   └── workflows/     # CI pipeline
├── AGENTS.md          # Agent workflow guide
└── README.md          # This file
```

## Architecture

- **Frontend:** React SPA with Vite, Radix Themes, React Router
- **Backend:** Hono on Node.js
- **Shared:** TypeScript types and pure logic (normalization, session engine)
- **Storage:** SQLite at `/data/now-spinning.sqlite`
- **Hosting:** Docker on Coolify/Hetzner, one application replica

### Security principles

- **No secrets in client:** All OAuth and API keys live in the Node server
- **Server-side tokens:** External service tokens stored in SQLite, keyed by session cookie
- **Encrypted tokens:** OAuth tokens and temporary OAuth state are encrypted with AES-256-GCM before SQLite persistence
- **HttpOnly cookies:** Session binding between client and Node server

See [SPEC.md](SPEC.md) for detailed architecture and security model.

## Contributing

Contributions welcome — please open issues or pull requests with a clear description of changes and ensure tests pass.

## License

See the [LICENSE](./LICENSE) file in the repository root.
