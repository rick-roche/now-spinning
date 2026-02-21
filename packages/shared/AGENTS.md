# AGENTS.md — packages/shared

Scope: Applies to everything under `packages/shared`.

If instructions conflict, follow: user request > this file > root `AGENTS.md`.

## Purpose

`packages/shared` contains cross-app contracts and pure logic (domain models, normalization, validation schemas, session/scrobble engine).

## Hard Rules

1. Purity first
- Keep core logic deterministic and side-effect free.
- No network calls, runtime env access, or platform-specific APIs.

2. Contract stability
- Treat shared contracts as API surface between web and worker.
- Prefer additive, backwards-compatible type changes where possible.

3. Explicit edge-case handling
- Normalize odd/missing Discogs data predictably.
- Keep session/scrobble transitions explicit and idempotent.

4. Boundary discipline
- Do not import from `apps/web` or `apps/worker`.
- Shared package must remain independently testable.

## Where To Change Code

- Contracts: `packages/shared/src/contracts`
- Domain models: `packages/shared/src/domain`
- Normalization: `packages/shared/src/normalize`
- Session engine: `packages/shared/src/session`
- Validation schemas: `packages/shared/src/validation`

## Testing Expectations

- Every behavior change in normalization/session/validation gets tests.
- Prefer fixture-driven tests for messy Discogs data.
- Cover edge cases before wiring changes into web/worker.

## Done Criteria (Shared-Specific)

- Logic remains pure and typed.
- Contracts stay coherent for both consumers.
- Vitest coverage updated for changed behavior and edge cases.
