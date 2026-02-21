# AGENTS.md — apps/web

Scope: Applies to everything under `apps/web`.

If instructions conflict, follow: user request > this file > root `AGENTS.md`.

## Purpose

`apps/web` is the Cloudflare Pages SPA (React + Vite). It owns UI, UX flows, and client-side state only.

## Hard Rules

1. No secrets in client code
- Never place Discogs/Last.fm secrets, token exchange logic, or signing logic in web code.
- Treat the Worker as the only trusted integration boundary for third-party APIs.

2. API usage
- Call backend via `/api/*` using shared helpers in `apps/web/src/lib`.
- Preserve cookie-based auth behavior (`credentials: 'include'` via shared API helper).
- Do not bypass shared error mapping conventions.

3. Mobile-first UX
- Validate on narrow viewport first.
- Keep touch targets and bottom-primary actions usable one-handed.

4. Boundary discipline
- Do not import Worker code.
- Shared contracts/types come from `packages/shared`.

## Where To Change Code

- Pages/routes: `apps/web/src/pages`
- Reusable UI: `apps/web/src/components`
- API + utilities: `apps/web/src/lib`
- Edge proxy function: `apps/web/functions/api/[[path]].ts`

## Testing Expectations

- Add/update tests beside impacted pages/components.
- Prefer user-visible behavior tests over implementation-detail tests.
- Keep `vitest` and Testing Library patterns consistent with existing tests.

## Done Criteria (Web-Specific)

- Mobile behavior verified for changed screens.
- Loading/error/empty states handled for changed data flows.
- No client-side secret/token exposure introduced.
