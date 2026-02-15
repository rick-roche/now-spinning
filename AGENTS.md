# agents.md — Now Spinning Vinyl Scrobbler

This repository is built to be agent-friendly: small, testable modules; clear boundaries between UI and backend; and strict security rules (no secrets in the client).

## Project summary

"Now Spinning" lets a user pick a Discogs release (from collection or search), start a “Now Playing” session, and scrobble tracks to Last.fm as vinyl is listened to. It is mobile-first and hosted on Cloudflare Pages (SPA) + Cloudflare Workers (API).

## Non-negotiables

1. **No secrets in the client**
   - Discogs / Last.fm secrets and token exchanges must happen in the Worker only.
   - The SPA never receives service secrets.
2. **Server-side token storage**
   - Store external tokens/session keys server-side (KV in MVP; D1 optional later).
   - Associate tokens to an internal `user_id` tied to an HttpOnly cookie.
3. **Type safety and tests**
   - Core logic must be pure & tested (normalization, session transitions, scrobble eligibility).
4. **Repo hygiene**
   - `pnpm` only.
   - `vitest` for tests.
   - `knip` must pass in CI.
5. **Mobile UX first**
   - Any UI work must verify on a narrow viewport and touch interactions.

---

## Roles (agent responsibilities)

### 1) API/Worker Agent
Owns:
- Worker routing & middleware (auth, validation, rate limiting)
- OAuth flows (Discogs & Last.fm)
- Token storage (KV) and session storage primitives
- Proxying Discogs API and calling Last.fm API (signing/idempotency)
- Centralized error mapping to stable API responses

Delivers:
- Worker endpoints in `/apps/worker/src/routes`
- `shared` types used by both UI & Worker
- Vitest tests for pure helpers (signing, hashing, validation)

---

### 2) Data/Normalization Agent
Owns:
- Converting Discogs responses into stable internal models:
  - `NormalizedRelease`, `NormalizedTrack`
  - Side detection and ordering heuristics
  - Handling missing/odd durations and positions
- Track ordering rules (A1, A2 … B1 …; fallback strategies)

Delivers:
- Pure functions in `/packages/shared/src/normalize`
- Exhaustive test fixtures and edge-case coverage

---

### 3) Session/Scrobble Engine Agent
Owns:
- Session state model
- Transition functions:
  - start/pause/resume/next/prev/end
- Scrobble eligibility rules (thresholds, missing durations)
- Idempotency + duplicate prevention
- Retry strategy (on interaction and on app load)

Delivers:
- Pure session engine in `/packages/shared/src/session`
- Integration points in Worker routes
- Tests for transitions + idempotency

---

### 4) UI/UX Agent
Owns:
- SPA routes/screens and mobile-first interaction
- State management for:
  - auth status
  - browsing/search
  - session controls
- Radix Themes layout patterns, accessible components, touch targets
- Offline-tolerant client queue (only for UI-level retries; tokens stay server-side)

Delivers:
- Screens in `/apps/web/src/pages`
- Components in `/apps/web/src/components`
- UX acceptance notes and mobile screenshots (or short GIF)

---

### 5) Quality/Tooling Agent
Owns:
- pnpm workspace config, TS configs, Vite/Vitest setup
- knip configuration and maintaining it as repo evolves
- CI pipeline (install → typecheck → test → knip → build)
- Contributor docs: README, local dev, env vars

Delivers:
- `.github/workflows/ci.yml`
- `knip.json`, `tsconfig.*`, `vitest.config.*`
- Scripts in root `package.json`

---

## Workflow

### A) How work is requested
Work is requested as a small, well-defined change with:
- a goal statement (“what user value is unlocked”)
- constraints (security, stack rules)
- acceptance criteria
- test expectations

### B) Branching / commits
- Prefer small PRs; avoid “mega PRs”.
- Commit messages should describe intent.
- Each PR should include:
  - what changed
  - why it changed
  - how to test locally
  - test evidence (`pnpm test`, `pnpm typecheck`, `pnpm knip`)

### C) Design before code (for risky pieces)
Before implementing:
- confirm API contract and types in `packages/shared`
- write a minimal test for the core logic
- then wire UI/Worker around it

### D) Review checklist (applies to all PRs)
- No secrets leaked to client (check network responses & env usage)
- Input validation in Worker routes
- Errors are stable and user-readable
- Tests added/updated
- knip passes
- Mobile UX verified

---

## Definitions

### Definition of Ready (DoR)
A task is ready for an agent when it includes:
1. **User outcome**: what the user can do after this change
2. **Scope**: what is included and explicitly excluded
3. **Acceptance criteria**: bullet list, measurable
4. **API/types impact**: does `packages/shared` change?
5. **Test plan**: what tests must be added/updated

If any are missing, the agent should propose a minimal spec update (SPEC.md) and proceed with sensible defaults rather than blocking.

### Definition of Done (DoD)
A task is done when:
- Implementation matches acceptance criteria
- Typecheck passes: `pnpm typecheck`
- Tests pass: `pnpm test`
- knip passes: `pnpm knip`
- `pnpm validate` passes (or CI equivalent if validate isn't available)
- No new lint/dead code issues introduced
- Any new env vars are documented
- UI changes include mobile verification evidence (notes + screenshot)

---

## Repo conventions

### Packages and boundaries
- `/apps/web` is the SPA (Cloudflare Pages).
- `/apps/worker` is the API backend (Cloudflare Workers).
- `/packages/shared` contains shared types and pure logic:
  - normalization
  - session engine
  - API contracts (request/response types)
- UI never imports Worker-only code; Worker never imports UI code.

### Error handling conventions
- Worker returns a consistent error shape:
  - `{ error: { code: string, message: string, requestId?: string } }`
- UI maps `code` to user-facing messages and retry actions.

### Testing conventions
- Pure logic tested in `/packages/shared`.
- Worker routes get lightweight tests where feasible; heavy logic stays pure in shared.

---

## Commands (expected to work)

- `pnpm i`
- `pnpm dev` (runs SPA + Worker locally)
- `pnpm test`
- `pnpm typecheck`
- `pnpm knip`
- `pnpm build`
- `pnpm validate`

If you add/modify commands, update this section.
