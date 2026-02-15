## Now Spinning Vinyl Scrobbler

### 1) Problem statement

When I listen to vinyl, my listening history on Last.fm stays incomplete. I want a lightweight mobile-first app that lets me pick a record (from my Discogs collection or a Discogs search), tap **Now Playing**, and have the app **scrobble each track** to Last.fm at the right time—so physical listening is reflected in Last.fm.

### 2) Goals

* **Mobile-first, one-handed UX**: fast selection + “Now Playing” in seconds.
* **Accurate scrobbling**: track sequence and timing, with a sensible approach to durations and user adjustments.
* **Secure by default**: no tokens in the client; minimal data stored; easy to revoke.
* **Low/zero cost hosting**: Cloudflare Pages + Workers (and KV/D1 only if needed).
* **Discogs integration**:

  * Browse **my collection** (and filter/search within it)
  * Search Discogs for records not in collection
  * View release tracklist and select pressing/version if multiple
* **Last.fm integration**:

  * Authenticate once
  * Send **Now Playing**
  * Submit **Scrobbles** as tracks “complete”
* **Developer-friendly repo** with pnpm + Vite + Vitest + knip and clear agent guidance.

### 3) Non-goals (initially)

* Audio recognition / “Shazam for vinyl”
* Automatic turntable detection
* Social features
* Multi-user public profiles
* Perfect track durations for every release (we’ll handle missing/incorrect durations gracefully)

---

## 4) Core user stories

### Authentication

1. As a user, I can connect **Discogs** (optional) to access my collection.
2. As a user, I can connect **Last.fm** (required for scrobbling).
3. As a user, I can revoke access to either service easily.

### Selecting a record

4. As a user, I can search my Discogs collection by artist/title.
5. As a user, I can search Discogs generally when it’s not in my collection.
6. As a user, I can open a release and see tracklist, sides, durations (if available).
7. As a user, I can choose a specific release/pressing if there are multiple matches.

### Now Playing & Scrobbling

8. As a user, I can tap **Start** to begin a “listening session” for the record.
9. As a user, I can see the current track, next track, elapsed time, and session controls.
10. As a user, tracks scrobble automatically as I progress.
11. As a user, I can **skip**, **pause**, **resume**, or **manually scrobble** a track if needed.
12. As a user, I can end a session and optionally scrobble remaining tracks.

### Quality of life

13. As a user, I can set defaults like “auto-advance”, “gap between tracks”, “minimum scrobble threshold”, “prefer side ordering”.
14. As a user, I can view recent sessions and re-run a record quickly.

---

## 5) UX principles (mobile-first)

* **Single primary CTA** per screen (e.g., “Now Playing”, “Start Session”, “Scrobble”).
* **Thumb-friendly** bottom actions; avoid header-only controls.
* **Fast resume**: “Continue last session” on home.
* **Offline-tolerant**: if network drops, queue actions and retry.
* Use **@radix-ui/themes** components consistently; avoid custom UI complexity early.

### Proposed screens

1. **Home**

   * Continue last session (if active)
   * Quick pick: recently played releases
   * Search entry point
2. **Search**

   * Tabs: Collection | Discogs Search
   * Results list (cover + artist + title + year)
3. **Release detail**

   * Release metadata
   * Tracklist grouped by side (if known)
   * Button: Start session
4. **Now Playing session**

   * Current track card
   * Timer + progress
   * Controls: Pause/Resume, Skip, Back, End
   * Secondary: “Scrobble now” / “Fix track”
5. **Settings**

   * Auth status
   * Scrobble behavior
   * Data/privacy
6. **Session history (v1)**

   * Past sessions, with “replay” option

---

## 6) Architecture (Cloudflare Pages + Workers)

### High-level approach

* **Pages** serves the React SPA (static).
* **Worker** acts as the secure backend for:

  * OAuth/token exchange & storage
  * Discogs API proxy calls (collection, release, search)
  * Last.fm signing + API calls (now playing + scrobble)
  * Session persistence / queueing (minimal)

### Why this split

* Keeps all secrets/tokens **server-side**.
* Avoids shipping Discogs/Last.fm secrets to the client.
* Lets you enforce rate limiting and input validation centrally.

### Suggested Cloudflare components

* **Workers**: API + OAuth handling
* **KV** (MVP): store encrypted tokens & short-lived session state
* **D1** (v1): store sessions/history more robustly (optional)
* **Queues** (optional): for resilient scrobble submission retries (can be deferred)

---

## 7) Security model

### Threat model (practical)

* Prevent token theft from the client
* Prevent replay/CSRF on auth callbacks
* Limit abuse of your Worker endpoints
* Avoid storing more personal data than necessary

### Key decisions

* Use **server-side OAuth**: client never sees Discogs/Last.fm secrets.
* Store tokens encrypted at rest (Worker-side), keyed by a **user session id**.
* Use **HTTP-only secure cookies** for session binding.
* Validate all inputs; strict allowlist of upstream endpoints.
* Add basic **rate limiting** per session/user agent.

### Token storage

* Store only what you need:

  * Discogs token/secret (if used)
  * Last.fm session key (and any required token)
* Associate tokens with an internal `user_id` derived from:

  * Random generated id stored in a secure cookie
  * No need for email/username storage initially unless required for UX

### Privacy posture

* No selling/sharing.
* Keep history minimal (opt-in).
* Provide “Delete my data” which clears KV/D1 entries.

---

## 8) API integrations

### Discogs

Use Discogs for:

* Collection listing (pagination)
* Release lookup (tracklist, artists, title, year, images)
* Search (release results)

Worker should:

* Normalize Discogs data to a stable internal shape.
* Handle pagination and caching (short TTL is fine).
* Be resilient to missing durations, ambiguous sides, weird formatting.

### Last.fm

Use Last.fm for:

* “Now Playing” updates (when a session starts or track changes)
* Scrobble submission (when track qualifies / user triggers)

Worker should:

* Centralize signing and request formatting.
* Implement retry logic for transient failures.
* Avoid duplicate submissions (idempotency via hash key).

**Important scrobble behavior note:** Last.fm has rules/expectations about when a track “counts” (time listened, etc.). This app should implement a configurable threshold (e.g., “scrobble after X% or after Y seconds”) and default to something conservative.

---

## 9) Scrobble/session behavior (the heart of it)

### Session definition

A **session** = user starts a record at time `t0` with an ordered list of tracks.

Session contains:

* release id (Discogs)
* track list with normalized fields
* current track index
* playback state: running/paused/ended
* timestamps: startedAt, pausedAt, resumedAt
* per-track: startedAt, scrobbledAt, status (pending/scrobbled/skipped)

### Track timing strategy

Records are messy (no durations, wrong durations, hidden tracks).

**MVP approach (robust + simple):**

* If track durations exist: use them to schedule auto-advance.
* If durations missing: see if the discogs master release has track timings and use those, else if not, use a default per-track duration (configurable) OR require manual advance.
* Always allow user overrides:

  * “Advance to next track”
  * “Scrobble current track now”
  * “Edit track duration (this session only)”

### Auto-scrobble rules

A track becomes eligible to scrobble when:

* It has been “playing” long enough according to settings:

  * Default: `min(50% of duration, configurable cap)` if duration known
  * Or: a fixed minimum seconds threshold if duration unknown
* And it has not already been scrobbled/skipped.

### Now Playing updates

* Send “Now Playing” when:

  * Session starts
  * Track changes
  * Resume from pause (optional, but nice)

### End session rules

When ending:

* Offer options:

  * “End without scrobbling remaining”
  * “Scrobble current + remaining as played” (dangerous, but user-controlled)
  * “Mark remaining as skipped”

### Idempotency / duplicate prevention

Compute `scrobble_id = hash(user_id, release_id, track_title, artist, startedAt_rounded)` and store it for a short TTL to prevent double submit.

---

## 10) Data model (normalized)

### NormalizedRelease

* `id`: string (Discogs release id)
* `title`: string
* `artist`: string (primary display)
* `year`: number | null
* `coverUrl`: string | null
* `tracks`: NormalizedTrack[]

### NormalizedTrack

* `position`: string (e.g., “A1”, “B3”, “1”, etc.)
* `title`: string
* `artist`: string (fallback to release artist)
* `durationSec`: number | null
* `side`: "A" | "B" | "C" | "D" | null (derived if possible)
* `index`: number (0-based, stable internal ordering)

### Session

* `id`: string
* `userId`: string
* `release`: NormalizedRelease (or reference + cached snapshot)
* `state`: "running" | "paused" | "ended"
* `currentIndex`: number
* `startedAt`: epoch ms
* `events`: SessionEvent[] (optional but useful)
* `tracks`: SessionTrackState[]

### SessionTrackState

* `index`: number
* `startedAt`: epoch ms | null
* `status`: "pending" | "scrobbled" | "skipped"
* `scrobbledAt`: epoch ms | null

---

## 11) Worker API (proposed)

Base: `/api`

### Auth

* `GET /auth/discogs/start`

* `GET /auth/discogs/callback`

* `POST /auth/discogs/disconnect`

* `GET /auth/lastfm/start`

* `GET /auth/lastfm/callback`

* `POST /auth/lastfm/disconnect`

* `GET /auth/status` → { discogsConnected, lastfmConnected }

### Discogs proxy

* `GET /discogs/collection?query=&page=`
* `GET /discogs/search?query=&type=release&page=`
* `GET /discogs/release/:id`

### Sessions

* `POST /session/start` body: { releaseId, orderingPrefs? }
* `POST /session/:id/pause`
* `POST /session/:id/resume`
* `POST /session/:id/next`
* `POST /session/:id/prev`
* `POST /session/:id/end` body: { endMode }
* `GET /session/current`
* `GET /session/history` (v1)

### Last.fm actions

* `POST /lastfm/now-playing` body: { sessionId, trackIndex }
* `POST /lastfm/scrobble` body: { sessionId, trackIndex } (usually internal-only via session engine)

**Note:** In MVP you can keep `/lastfm/*` internal and trigger scrobbles from session endpoints to reduce surface area.

---

## 12) Session engine placement

You have two viable options:

### Option A (simplest): Client-driven ticks

* The client keeps the timer and calls Worker on key transitions:

  * start, pause, resume, next
* Worker validates state, submits now playing/scrobbles on transitions.
* Pros: simplest infra; no background scheduling.
* Cons: if user closes the tab mid-track, auto-scrobble may not happen until reopen.

### Option B (more “correct”): Worker-driven scheduling

* Worker stores schedule and uses a queue/alarm-like mechanism to submit scrobbles.
* Pros: more reliable even if client goes away.
* Cons: more moving parts.

**MVP recommendation:** Option A. Vinyl listening is interactive anyway; you’ll be opening the app to flip sides and such. Add resilience later.

---

## 13) Error handling & resilience

* If Discogs/Last.fm fails:

  * show non-blocking banner + “retry”
  * keep session running locally
  * queue “pending actions” in local storage and replay on reconnect
* If a scrobble fails:

  * mark as “pending retry”
  * retry on next interaction (pause/resume/next) and on app load

---

## 14) Performance

* Cache Discogs release details in Worker (short TTL) to reduce repeated calls.
* Minimize payload sizes (only what UI needs).
* Use pagination + infinite scroll for collection.
* Prefer cover thumbnails.

---

## 15) Repo standards (pnpm, Vite, Vitest, knip)

### Package manager

* pnpm only (lockfile enforced)
* Node version pinned (via `.nvmrc` and/or `packageManager` field)

### Testing

* Vitest unit tests:

  * normalization functions (Discogs → internal models)
  * session transition logic
  * idempotency hashing
  * API client wrappers (mock fetch)

### Lint/typecheck

* TypeScript strict mode
* Consider biome/eslint (choose one; keep it lightweight)

### knip

* knip must run in CI to prevent dead code/config drift
* Keep config clean: ignore only what’s necessary (e.g., vite config patterns, workers entry)

### CI (baseline)

* install → typecheck → test → knip
* optional: build + worker dry-run

---

## 16) “Definition of Done” for MVP

MVP is done when:

* User can auth Last.fm and Discogs
* User can browse collection + search Discogs
* Release detail shows tracklist and can start a session
* Session screen:

  * now playing updates on start/track change
  * scrobbles submit for at least “manual advance” flow
* Works smoothly on mobile Safari/Chrome
* Tokens never exposed to client
* Tests cover core normalization + session logic
* knip passes cleanly

---

## 17) Milestones

### M0: Skeleton

* Pages app scaffold (Vite + React + Radix Themes)
* Worker scaffold with `/api/health`
* Shared types package or folder

### M1: Auth

* Last.fm auth end-to-end
* Discogs auth end-to-end
* Auth status screen

### M2: Discogs browsing

* Collection list + search
* Discogs search
* Release details + normalization

### M3: Session MVP

* Start session
* Now playing on start + next
* Manual scrobble on “next”
* Basic pause/resume

### M4: Quality

* Auto-advance when durations known
* Offline queue & retry
* History (optional)

---

## 18) Open questions / decisions (record as you go)

* How to handle compilation albums with varying track artists (prefer track-level artist when available)
* Handling “side” ordering when positions are missing/odd
* Default scrobble threshold behavior (choose conservative defaults)
* Whether to store session history server-side (D1) or local-only initially
* Whether multi-device continuity is required (probably not for MVP)

---

# 19) Agents guidance (mirror into agents.md)

This repo uses agents to accelerate development while keeping quality high. Agents should:

## Project principles

* Preserve security boundaries: **no secrets in client**
* Keep Worker endpoints minimal and validated
* Prefer pure functions for complex logic (easy to test)
* Don’t introduce new dependencies unless justified

## Work breakdown for agents

* **Agent: API/Worker**

  * OAuth flows, token storage, upstream proxying, validation, rate limiting
* **Agent: Data/Normalization**

  * Discogs → NormalizedRelease/Track with strong tests
* **Agent: Session Engine**

  * Transition logic, scrobble eligibility, idempotency, retry strategy
* **Agent: UI**

  * Mobile UX with Radix Themes, flows + state management, accessibility
* **Agent: Quality**

  * Vitest suite, knip config, CI pipeline, repo hygiene

## “How to work” rules

* Always add/adjust tests when changing core logic
* Keep types centralized and shared between client/worker
* Update SPEC.md when scope/decisions change
* Keep commits small and explain intent

## Required outputs for any PR

* What changed and why
* Screenshots (mobile view) for UI changes
* Test evidence (vitest, typecheck, knip)
