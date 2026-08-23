---
name: copilot-review-loop
description: Use when evaluating GitHub Copilot PR review comments, fixing actionable feedback, rerunning validation, and resolving review conversations.
---

# Copilot Review Loop

Use this workflow for repeated Copilot review passes on a pull request.

## Workflow

1. Read the repository `AGENTS.md` files that apply to the changed paths.
2. Fetch PR metadata, commits, reviews, inline comments, review-thread resolution state, and checks with `gh`.
3. Inspect the current branch and compare each comment with the current code, not only the commit referenced by the comment.
4. Classify every item as actionable, already fixed, outdated, duplicate, suppressed-but-valid, or informational.
5. Implement sensible actionable and suppressed-but-valid fixes. Prefer the smallest correct change and add focused tests for behavior changes.
6. Run the repository validation commands. If local tooling is unavailable, use GitHub CI and report the exact blocker.
7. Inspect the final diff and worktree, then commit only intended files and push the PR branch.
8. Resolve addressed review threads through the GitHub GraphQL API. Do not resolve feedback that remains unaddressed.
9. Re-fetch reviews, threads, and checks after the push. Repeat until no actionable feedback remains.

## Review Rules

- Treat comments on old commits as hypotheses to verify against current code.
- Treat suppressed comments as feedback to evaluate, not automatically dismiss.
- Do not change behavior solely to satisfy stylistic feedback unless it improves consistency, accessibility, correctness, or maintainability.
- Preserve the repository's API, security, testing, and mobile UX boundaries.
- Never resolve a thread before its fix is present in the pushed branch.
- Report stale comments, unresolved risks, CI failures, local environment blockers, and the final resolved-thread count.

## Useful Commands

```sh
gh pr view <number> --json commits,reviews,statusCheckRollup,url
gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate
gh api repos/<owner>/<repo>/pulls/<number>/reviews --paginate
gh pr checks <number> --watch
```
