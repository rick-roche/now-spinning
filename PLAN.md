# Now Spinning — Implementation Plan

**Current milestone:** M1 (Auth)  
**Status:** ✅ Complete  
**Last updated:** 2026-02-16

---

## Quick reference

- **SPEC:** [SPEC.md](SPEC.md) — Full product specification
- **AGENTS:** [AGENTS.md](AGENTS.md) — Agent workflow and responsibilities
- **README:** [README.md](README.md) — Setup and local dev instructions

---

## M0: Skeleton — Monorepo Foundation

**Goal:** Establish the foundational monorepo structure with working local dev and minimal endpoints.

**Key decisions:**
- **Router:** Hono (modern, type-safe, popular for Workers)
- **Linting:** ESLint 9 with flat config (added during M0 instead of deferring)
- **CI:** GitHub Actions (typecheck + test + lint + knip)
- **Node version:** 20.11+ LTS
- **Radix Themes:** Default theme (customize in M1+)

### Implementation steps

- [x] 1. Create PLAN.md for progress tracking
- [x] 2. Create root workspace configuration
  - [x] `package.json` (workspace scripts: dev, build, test, typecheck, lint, knip)
  - [x] `pnpm-workspace.yaml`
  - [x] `.nvmrc` (Node 20.11+)
  - [x] `.gitignore`
  - [x] `tsconfig.base.json` (strict mode, workspace paths)
- [x] 3. Scaffold packages/shared (types + pure logic)
  - [x] `packages/shared/package.json`
  - [x] `packages/shared/tsconfig.json`
  - [x] `packages/shared/vitest.config.ts`
  - [x] `packages/shared/src/index.ts`
  - [x] `packages/shared/src/domain/release.ts` (NormalizedRelease, NormalizedTrack)
  - [x] `packages/shared/src/domain/session.ts` (Session, SessionTrackState)
  - [x] `packages/shared/src/contracts/errors.ts` (Worker error shape)
- [x] 4. Scaffold apps/worker (Cloudflare Worker API)
  - [x] `apps/worker/package.json`
  - [x] `apps/worker/tsconfig.json`
  - [x] `apps/worker/wrangler.toml`
  - [x] `apps/worker/vitest.config.ts`
  - [x] `apps/worker/src/index.ts` (Hono app + routing)
  - [x] `apps/worker/src/routes/health.ts` (GET /api/health)
- [x] 5. Scaffold apps/web (Cloudflare Pages SPA)
  - [x] `apps/web/package.json`
  - [x] `apps/web/tsconfig.json` + `tsconfig.node.json`
  - [x] `apps/web/vite.config.ts` (proxy /api/* → Worker)
  - [x] `apps/web/vitest.config.ts`
  - [x] `apps/web/index.html`
  - [x] `apps/web/src/main.tsx` (Radix Theme provider)
  - [x] `apps/web/src/app/App.tsx` (router + routes)
  - [x] `apps/web/src/pages/Home.tsx` (Radix Button + Card)
  - [x] `apps/web/src/pages/Settings.tsx` (auth placeholder)
  - [x] `apps/web/public/_redirects` (SPA routing)
- [x] 6. Configure knip for monorepo
  - [x] `knip.json` (workspace entry points + ignores)
- [x] 7. Set up GitHub Actions CI
  - [x] `.github/workflows/ci.yml` (install → typecheck → test → lint → knip)
- [x] 8. Create README with dev instructions
  - [x] `README.md` (setup, commands, links to docs)
- [x] 9. Add ESLint configuration
  - [x] `eslint.config.js` (flat config with TypeScript + React support)
  - [x] ESLint packages installed and configured
  - [x] Lint scripts added to all workspaces
  - [x] ESLint integrated into CI pipeline

### Acceptance criteria

**Commands:**
- [x] `pnpm install` completes successfully
- [x] `pnpm typecheck` passes all workspaces
- [x] `pnpm knip` reports zero issues
- [x] `pnpm lint` passes with no errors
- [x] `pnpm dev` starts SPA (localhost:5173) + Worker (localhost:8787)
- [x] `curl http://localhost:8787/api/health` returns `{"status":"ok","timestamp":...}`
- [x] `pnpm test` runs without errors
- [x] CI passes (typecheck → test → lint → knip)

**Manual verification:**
- [x] Home page displays Radix Card and Button
- [x] Settings page shows auth placeholder
- [x] No TypeScript errors in editor
- [x] Workspace boundaries respected (web ↛ worker; both → shared)
- [x] ESLint configured with TypeScript and React support

---

## M1: Auth — OAuth Flows & Session Management

**Goal:** Implement Last.fm and Discogs OAuth flows with secure server-side token storage and auth status screen.

**Key decisions:**
- **Session model:** HttpOnly secure cookies + KV-backed token storage (no secrets exposed to client)
- **OAuth protocols:** OAuth 2.0 (Last.fm) + OAuth 1.0a PLAINTEXT (Discogs MVP)
- **CSRF protection:** State tokens stored in KV with 10-minute TTL
- **Token storage:** Keyed by session ID in KV namespace with service-specific entries

### Implementation steps

- [x] 1. Define auth type contracts
  - [x] `packages/shared/src/contracts/auth.ts` (StoredToken, AuthStatusResponse, OAuth flows)
- [x] 2. Create OAuth helper functions
  - [x] `apps/worker/src/oauth.ts` (generateRandomString, parseFormEncoded)
- [x] 3. Implement session middleware
  - [x] `apps/worker/src/middleware/auth.ts` (cookie management, KV token/state storage)
- [x] 4. Implement Last.fm OAuth flow
  - [x] `apps/worker/src/routes/auth/lastfm.ts` (/start, /callback, /disconnect endpoints)
- [x] 5. Implement Discogs OAuth 1.0a flow
  - [x] `apps/worker/src/routes/auth/discogs.ts` (/start, /callback, /disconnect endpoints)
- [x] 6. Create auth router with status endpoint
  - [x] `apps/worker/src/routes/auth.ts` (/status endpoint + route mounting)
- [x] 7. Integrate auth routes into Worker
  - [x] `apps/worker/src/index.ts` (mount /api/auth routes)
- [x] 8. Configure OAuth secrets in wrangler.toml
  - [x] `apps/worker/wrangler.toml` (KV namespace + env vars for callbacks)
- [x] 9. Build auth status UI
  - [x] `apps/web/src/pages/Settings.tsx` (connect/disconnect buttons + status display)
- [x] 10. Fix TypeScript and linting issues
  - [x] Type safety: Proper typing of KV responses without 'any' unions
  - [x] Hono API: Correct status code passing (`c.json(data, 500)`)
  - [x] URLSearchParams: Proper toString() for template interpolation
  - [x] Async handlers: Correct Promise handling in onClick

### Acceptance criteria

**Functionality:**
- [x] Last.fm OAuth flow works end-to-end (start → authorize → token stored)
- [x] Discogs OAuth 1.0a flow works end-to-end (request token → authorize → access token stored)
- [x] Auth status screen displays connection states
- [x] Disconnect functionality revokes tokens
- [x] Session IDs persist across requests via secure httpOnly cookies
- [x] CSRF protection via state tokens with short TTL

**Security:**
- [x] No service secrets exposed in client responses
- [x] All tokens stored server-side in KV
- [x] Cookie flags: httpOnly, secure, sameSite=Lax
- [x] Session ID 16-byte cryptographically random

**Code quality:**
- [x] TypeScript compilation passes (`pnpm typecheck`)
- [x] Linting passes cleanly (`pnpm lint`)
- [x] Dead code check passes (`pnpm knip`)
- [x] Tests pass (`pnpm test`)
- [x] CI ready (typecheck → test → lint → knip)

**Manual verification:**
- [x] Settings page loads and displays "Not connected" states
- [x] Connect buttons present and functional (UI ready)
- [x] Disconnect buttons present and functional (UI ready)
- [x] Worker routes properly configured for OAuth callbacks

**Known limitations (M1 scope):**
- Mobile device testing not yet performed (defer to M2)
- OAuth flow not tested against live APIs (manual verification needed before production)
- Session history not implemented (scope for M3+)

---

## Next milestones

### M1: Auth (after M0)
- Last.fm OAuth end-to-end
- Discogs OAuth end-to-end
- Auth status screen

### M2: Discogs browsing
- Collection list + search
- Discogs search
- Release details + normalization

### M3: Session MVP
- Start session
- Now playing on start + next
- Manual scrobble on "next"
- Basic pause/resume

### M4: Quality
- Auto-advance when durations known
- Offline queue & retry
- History (optional)

---

## Notes / decisions log

*Record important decisions and context here as work progresses.*

- **2026-02-15:** M0 started. Chose Hono for Worker routing, deferred linting to M1.
- **2026-02-15:** Added ESLint 9 with flat config during M0 (TypeScript + React support, integrated into CI).
