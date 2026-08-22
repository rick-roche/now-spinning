# AGENTS.md — apps/server

Scope: Applies to everything under `apps/server`.

If instructions conflict, follow: user request > this file > root `AGENTS.md`.

## Purpose

`apps/server` is the secure Node.js backend (Hono). It owns auth, OAuth, token handling, API integrations, scheduling, and stable error responses.

## Hard Rules

1. Security boundary
- Keep Discogs/Last.fm secrets and signing logic in the server only.
- Never return secrets, session keys, or raw upstream sensitive payloads to clients.

2. Validation and error contracts
- Validate input at route boundaries.
- Return stable error shape:
  - `{ error: { code, message, requestId? } }`
- Keep error codes/messages predictable for UI mapping.

3. Session/token handling
- Use server-side token/session storage patterns only.
- Preserve HttpOnly cookie binding behavior for internal session/user IDs.

4. Integration discipline
- Discogs/Last.fm API interactions should go through server utilities where available.
- Add idempotency protections for scrobble-related behavior changes.

## Where To Change Code

- Routes: `apps/server/src/routes`
- Middleware: `apps/server/src/middleware`
- Integrations/utilities: `apps/server/src/utils`, `apps/server/src/lastfm.ts`, `apps/server/src/oauth.ts`
- Server composition and env wiring: `apps/server/src/app.ts`, `apps/server/src/server.ts`

## Testing Expectations

- Keep heavy business logic in `packages/shared` and test there.
- Add lightweight route/middleware tests for request validation and response contracts.
- Add/update integration helper tests when signing/auth/session behavior changes.

## Done Criteria (Server-Specific)

- Route inputs validated and malformed input handled safely.
- No secret leakage in logs/responses.
- Error contract remains stable for UI consumers.
- Server shutdown releases the scheduler lease and closes SQLite cleanly.
- Scheduler changes preserve single-owner behavior across container replacements.
