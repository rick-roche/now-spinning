# Now Spinning — Vinyl Scrobbler

[![CI](https://github.com/rick-roche/now-spinning/actions/workflows/ci.yml/badge.svg)](https://github.com/rick-roche/now-spinning/actions/workflows/ci.yml) [![Deploy](https://github.com/rick-roche/now-spinning/actions/workflows/deploy.yml/badge.svg)](https://github.com/rick-roche/now-spinning/actions/workflows/deploy.yml)


A mobile-first app for scrobbling vinyl listening sessions to [last.fm](https://www.last.fm/).

Connect your [last.fm](https://www.last.fm/) and [Discogs](https://www.discogs.com/) accounts and then

- Pick a record from your [Discogs](https://www.discogs.com/) collection
- Tap **Start Scrobbling**, and let the app scrobble each track as you listen.

## Documentation

- **[SPEC.md](SPEC.md)** — Full product specification
- **[AGENTS.md](AGENTS.md)** — Agent workflow and responsibilities
- **[PLAN.md](PLAN.md)** — Current implementation plan and progress

---

## Prerequisites

- **Node.js** 20.11 or later ([nvm](https://github.com/nvm-sh/nvm) recommended)
- **pnpm** 9.15.0 or later

Install pnpm globally if needed:

```bash
npm install -g pnpm@9.15.0
```

---

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start local development

There are secrets that are needed (set with: wrangler secret put KEY --env development or in a `apps/worker/.dev.vars` file)

Note: These are required before OAuth flows will work.

- LASTFM_API_KEY
- LASTFM_API_SECRET
- DISCOGS_CONSUMER_KEY
- DISCOGS_CONSUMER_SECRET

This runs both the SPA and Worker concurrently:

```bash
pnpm dev
```

- **SPA:** http://localhost:5173
- **Worker API:** http://localhost:8787
- **Health check:** http://localhost:5173/api/health

The SPA proxies `/api/*` requests to the Worker automatically.

### 3. Verify it works

Open http://localhost:5173 in your browser.

---

## Available commands

All commands run from the **workspace root**:

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm dev`         | Start SPA + Worker in dev mode           |
| `pnpm build`       | Build all workspaces for production      |
| `pnpm test`        | Run all tests (Vitest)                   |
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

# In the worker
pnpm -C apps/worker dev
pnpm -C apps/worker deploy

# In shared package
pnpm -C packages/shared test
```

## Project structure

```
now-spinning/
├── apps/
│   ├── web/           # React SPA (Cloudflare Pages)
│   └── worker/        # API backend (Cloudflare Workers)
├── packages/
│   └── shared/        # Shared types + pure logic
├── .github/
│   └── workflows/     # CI pipeline
├── AGENTS.md          # Agent workflow guide
└── README.md          # This file
```

## Architecture

- **Frontend:** React SPA with Vite, Radix Themes, React Router
- **Backend:** Cloudflare Workers with Hono
- **Shared:** TypeScript types and pure logic (normalization, session engine)
- **Storage:** Cloudflare KV (tokens + sessions)
- **Hosting:** Cloudflare Pages (SPA) + Workers (API on `/api/*` route)

### Security principles

- **No secrets in client:** All OAuth and API keys live in the Worker
- **Server-side tokens:** External service tokens stored in KV, keyed by session cookie
- **HttpOnly cookies:** Session binding between client and Worker

See [SPEC.md](SPEC.md) for detailed architecture and security model.

## Contributing

Contributions welcome — please open issues or pull requests with a clear description of changes and ensure tests pass.

## License

See the [LICENSE](./LICENSE) file in the repository root.


