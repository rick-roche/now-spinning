---
name: copilot-review-loop
description: Use when evaluating GitHub Copilot PR review comments, fixing actionable feedback, rerunning validation, and resolving review conversations.
---

# Copilot Review Loop

Use this workflow for repeated Copilot review passes on a pull request. Track the number of Copilot review iterations during the current task.

## Stop Conditions

- **Approval stop:** Stop immediately when the latest Copilot review says `Approval recommended` or equivalent, even if suppressed non-blocking suggestions remain. Report those suggestions without implementing them unless the user explicitly requests another pass.
- **Three-iteration hard stop:** Stop after three Copilot review iterations maximum. Do not request or perform a fourth review pass; report remaining feedback and ask the user whether to continue in a separate task.
- A user explicitly asking to evaluate another newly posted review starts a new task, but the three-iteration limit still applies within that task.

## Workflow

1. Read the repository `AGENTS.md` files that apply to the changed paths.
2. Fetch PR metadata, commits, reviews, inline comments, review-thread resolution state, and checks with `gh`.
3. Inspect the current branch and compare each comment with the current code, not only the commit referenced by the comment.
4. Classify every item as actionable, already fixed, outdated, duplicate, suppressed-but-valid, or informational.
5. Implement sensible actionable and suppressed-but-valid fixes. Prefer the smallest correct change and add focused tests for behavior changes.
6. Run the repository validation commands. If local tooling is unavailable, use GitHub CI and report the exact blocker.
7. Inspect the final diff and worktree, then commit only intended files and push the PR branch.
8. Resolve addressed review threads through the GitHub GraphQL API. Do not resolve feedback that remains unaddressed.
9. Re-fetch reviews, threads, and checks after the push. Repeat only if the stop conditions have not been reached and the latest review is not an approval.

## Review Rules

- Treat comments on old commits as hypotheses to verify against current code.
- Treat suppressed comments as feedback to evaluate, not automatically dismiss.
- Do not change behavior solely to satisfy stylistic feedback unless it improves consistency, accessibility, correctness, or maintainability.
- Preserve the repository's API, security, testing, and mobile UX boundaries.
- Never resolve a thread before its fix is present in the pushed branch.
- Report stale comments, unresolved risks, CI failures, local environment blockers, and the final resolved-thread count.
- Treat `Approval recommended` as a successful terminal state, not as permission to continue polishing suppressed suggestions.
- Count every Copilot review result that triggers a new evaluation as one iteration, including reviews with suppressed comments and reviews with no inline comments.

## Useful Commands

```sh
gh pr view <number> --json commits,reviews,statusCheckRollup,url
gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate
gh api repos/<owner>/<repo>/pulls/<number>/reviews --paginate
gh pr checks <number> --watch
```
