# AGENTS.md — apps/worker

Scope: Applies to everything under `apps/worker`.

If instructions conflict, follow: user request > this file > root `AGENTS.md`.

## Purpose

`apps/worker` is the secure backend (Cloudflare Workers + Hono). It owns auth, OAuth, token handling, API integrations, and stable error responses.

## Hard Rules

1. Security boundary
- Keep Discogs/Last.fm secrets and signing logic in Worker only.
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
- Discogs/Last.fm API interactions should go through shared Worker utilities where available.
- Add idempotency protections for scrobble-related behavior changes.

## Where To Change Code

- Routes: `apps/worker/src/routes`
- Middleware: `apps/worker/src/middleware`
- Integrations/utilities: `apps/worker/src/utils`, `apps/worker/src/lastfm.ts`, `apps/worker/src/oauth.ts`
- Worker entry and env wiring: `apps/worker/src/index.ts`

## Testing Expectations

- Keep heavy business logic in `packages/shared` and test there.
- Add lightweight route/middleware tests for request validation and response contracts.
- Add/update integration helper tests when signing/auth/session behavior changes.

## Done Criteria (Worker-Specific)

- Route inputs validated and malformed input handled safely.
- No secret leakage in logs/responses.
- Error contract remains stable for UI consumers.
