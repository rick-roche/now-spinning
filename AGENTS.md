# AGENTS.md — Now Spinning Vinyl Scrobbler

This file is the repo-wide operating guide for coding agents.

Use it as the first read, then load only the docs needed for the current task.

## 1) Project Snapshot

Now Spinning is a mobile-first app that lets users pick a Discogs release, start a listening session, and scrobble vinyl tracks to Last.fm.

- Frontend: Cloudflare Pages SPA (`apps/web`)
- Backend: Cloudflare Worker API (`apps/worker`)
- Shared logic/contracts: TypeScript package (`packages/shared`)

## 2) Non-Negotiable Rules

1. No secrets in client code
- Discogs/Last.fm secrets and token exchange happen in Worker only.
- SPA must never receive service secrets.

2. Server-side token storage
- Store external tokens/session keys server-side (KV in MVP, D1 optional later).
- Bind tokens to an internal `user_id` via HttpOnly cookie.

3. Shared pure logic and tests
- Keep normalization/session/scrobble logic pure in `packages/shared`.
- Add/update Vitest coverage for behavior changes.

4. Tooling and hygiene
- Use `pnpm` only.
- `vitest` for tests.
- `knip` must remain clean.

5. Mobile UX first
- UI changes must be verified on narrow viewport and touch targets.

## 3) Instruction Hierarchy And Scope

Follow this precedence order when instructions differ:

1. Direct user request
2. Closest nested `AGENTS.md` for the target path
3. This root `AGENTS.md` (repo-wide defaults)
4. Task-specific docs (`SPEC.md`, `PLAN.md`, quality plans)
5. File-local conventions already present in code/tests

Guidance for future refinement:
- Keep this root file focused on durable repo-wide rules.
- Put narrower, folder-specific guidance in nested `AGENTS.md` files only when a subtree truly needs different rules.
- Avoid duplicate instructions across files.

Current scoped files:
- `apps/web/AGENTS.md`
- `apps/worker/AGENTS.md`
- `packages/shared/AGENTS.md`

## 4) Repo Boundaries

- `apps/web`: UI routes, components, client state, API client calls
- `apps/worker`: auth/OAuth, route validation, token/session storage, third-party API calls
- `packages/shared`: contracts, domain types, normalization, session/scrobble engine

Boundary constraints:
- Web must not import Worker-only code.
- Worker must not import Web code.
- Cross-app contracts belong in `packages/shared`.

## 5) Agent Role Map

### API/Worker Agent
Owns Worker routing/middleware, OAuth flows, token/session storage, Discogs/Last.fm integration, and stable error responses.

Primary paths:
- `apps/worker/src/routes`
- `apps/worker/src/middleware`
- `apps/worker/src/utils`

### Data/Normalization Agent
Owns Discogs-to-internal normalization and track ordering heuristics.

Primary paths:
- `packages/shared/src/normalize`
- `packages/shared/src/domain/release.ts`

### Session/Scrobble Engine Agent
Owns session state transitions, eligibility rules, idempotency, and retry strategy.

Primary paths:
- `packages/shared/src/session`
- `packages/shared/src/domain/session.ts`

### UI/UX Agent
Owns mobile-first screens, interaction flows, and accessibility.

Primary paths:
- `apps/web/src/pages`
- `apps/web/src/components`
- `apps/web/src/lib`

### Quality/Tooling Agent
Owns workspace scripts/config, CI, and dead-code/type safety guardrails.

Primary paths:
- `.github/workflows`
- `package.json`
- `knip.json`
- `tsconfig.base.json`

## 6) Task Intake Template (Definition Of Ready)

A task is ready when it includes:

1. User outcome
2. Scope (in + out)
3. Acceptance criteria (measurable)
4. API/type impact (`packages/shared` change or not)
5. Test plan

If missing, propose a minimal update to `SPEC.md` and proceed with sensible defaults.

## 7) Execution Protocol

1. Confirm impacted boundary (`web`, `worker`, `shared`, tooling).
2. For risky logic, update/add tests first in `packages/shared`.
3. Implement smallest viable change.
4. Validate with project commands.
5. Report: what changed, why, how to test.

## 8) Definition Of Done

A task is done when all are true:

- Acceptance criteria met
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm knip` passes
- `pnpm validate` passes (or CI equivalent if unavailable locally)
- No new lint/dead-code issues
- New env vars documented
- UI changes include mobile verification notes (and screenshot/GIF when requested)

## 9) Error And Security Conventions

Worker error response shape:

```json
{ "error": { "code": "string", "message": "string", "requestId": "optional" } }
```

Required practices:
- Validate inputs at Worker route edges.
- Map internal failures to stable, user-readable error codes/messages.
- Keep OAuth/token operations server-side only.

## 10) Canonical Commands

Run from workspace root:

- `pnpm i`
- `pnpm dev`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm knip`
- `pnpm build`
- `pnpm validate`

If scripts change, update this section and `README.md` in the same PR.

## 11) Progressive-Disclosure Doc Map

Load only what is needed:

- Product/architecture/security details: `SPEC.md`
- Current implementation status: `PLAN.md`
- Local setup and commands: `README.md`

## 12) PR Checklist

Every PR should include:

- What changed
- Why it changed
- How to test locally
- Evidence of checks run (`pnpm test`, `pnpm typecheck`, `pnpm knip`, and/or `pnpm validate`)
- Confirmation that no client-side secret exposure was introduced
