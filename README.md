# Now Spinning — Vinyl Scrobbler

A mobile-first app for scrobbling vinyl listening sessions to Last.fm.

Pick a record from your Discogs collection, tap **Now Playing**, and let the app scrobble each track as you listen.

---

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

This runs both the SPA and Worker concurrently:

```bash
pnpm dev
```

- **SPA:** http://localhost:5173
- **Worker API:** http://localhost:8787
- **Health check:** http://localhost:5173/api/health

The SPA proxies `/api/*` requests to the Worker automatically.

### 3. Verify it works

Open http://localhost:5173 in your browser. You should see:

- A Radix Themes-styled home page
- An API health status indicator
- Navigation to Home and Settings

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

---

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
├── SPEC.md            # Product specification
├── AGENTS.md          # Agent workflow guide
├── PLAN.md            # Implementation plan
└── README.md          # This file
```

---

## Architecture

- **Frontend:** React SPA with Vite, Radix Themes, React Router
- **Backend:** Cloudflare Workers with Hono
- **Shared:** TypeScript types and pure logic (normalization, session engine)
- **Storage:** Cloudflare KV (for tokens/sessions, to be added in M1)
- **Hosting:** Cloudflare Pages (SPA) + Workers (API on `/api/*` route)

### Security principles

- **No secrets in client:** All OAuth and API keys live in the Worker
- **Server-side tokens:** External service tokens stored in KV, keyed by session cookie
- **HttpOnly cookies:** Session binding between client and Worker

See [SPEC.md](SPEC.md) for detailed architecture and security model.

---

## Current milestone: M0 (Skeleton)

**Status:** ✅ Complete

**Deliverables:**
- ✅ Monorepo with pnpm workspaces
- ✅ React SPA with Radix Themes
- ✅ Worker with `/api/health` endpoint
- ✅ Shared types package
- ✓ CI pipeline (typecheck + test + lint + knip)
- ✓ ESLint with TypeScript and React support

**Next:** M1 will add Discogs and Last.fm OAuth authentication.

---

## Contributing

This project uses agents to accelerate development while maintaining quality.

Before starting work:

1. Read [AGENTS.md](AGENTS.md) for workflow and role definitions
2. Check [PLAN.md](PLAN.md) for current tasks and progress
3. Ensure your changes match the **Definition of Ready** criteria

All PRs should include:

- Test evidence (`pnpm test`, `pnpm typecheck`, `pnpm knip`)
- Mobile UX verification (screenshots for UI changes)
- Clear description of what changed and why

---

## License

Private project — not currently open source.
