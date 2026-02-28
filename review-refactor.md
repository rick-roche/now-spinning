# Code Review & Refactoring Plan

**Date:** 2026-02-28  
**Status:** In Progress

## Overview

This document outlines a comprehensive refactoring plan to improve code quality, accessibility, maintainability, and user experience of the Now Spinning vinyl scrobbler application.

---

## Phase 1: Accessibility Fixes

**Priority:** HIGH - WCAG 2.2 Level AA Compliance  
**Estimated Time:** 1-2 days  
**Impact:** Critical for inclusive user experience

### Objectives
- Achieve WCAG 2.2 Level AA compliance
- Improve keyboard navigation
- Enhance screen reader compatibility
- Ensure proper focus management

### Tasks

#### 1.1 Add Skip Link
- Add skip link as first focusable element in App.tsx
- Style with `.sr-only` class for screen reader only visibility
- Ensure it becomes visible on focus

#### 1.2 Fix ARIA Labels
- Add proper labels to all interactive elements
- Remove or properly label "invisible" header buttons
- Add accessible names to search inputs (not just placeholders)
- Ensure button accessible names match visible labels for voice control

#### 1.3 Improve Image Alt Text
- Replace generic alt text ("Album Art") with descriptive alternatives
- Format: `${artist} - ${title} album cover`
- Ensure decorative images have empty alt=""

#### 1.4 Add Visible Focus Indicators
- Create consistent focus ring utility classes
- Ensure 3:1 contrast ratio for focus indicators
- Apply to all interactive elements (buttons, links, inputs)
- Test focus visibility in all states (hover, active, focus)

#### 1.5 Add Live Regions
- Implement `role="status"` for loading states
- Add `aria-live="polite"` for non-critical updates
- Add `aria-live="assertive"` for errors
- Ensure screen readers announce state changes

#### 1.6 Verify Touch Target Sizes
- Ensure all interactive elements meet 44×44px minimum
- Check BottomNav buttons
- Verify Session controls
- Test on actual mobile devices

#### 1.7 Verify Color Contrast
- Test all text meets 4.5:1 contrast (3:1 for large text)
- Verify focus indicators meet 3:1 contrast
- Check disabled states
- Test in forced colors mode

### Validation
- Manual keyboard navigation test
- Screen reader test (VoiceOver/NVDA)
- Automated accessibility scan (axe DevTools)
- Mobile device testing
- All tests pass
- TypeScript passes
- Knip passes

---

## Phase 2: Session Component Refactor

**Priority:** HIGH - Technical Debt Reduction  
**Estimated Time:** 2-3 days  
**Impact:** Improved maintainability and testability

### Objectives
- Reduce Session.tsx complexity from 500+ lines
- Extract reusable custom hooks
- Split into smaller, focused components
- Improve testability and maintainability

### Tasks

#### 2.1 Extract Custom Hooks

**Create `hooks/useSessionTimer.ts`:**
- Manage elapsed time tracking
- Handle sessionStorage persistence
- Expose: `{ elapsedMs, formatTime, reset }`
- Isolate timer logic from component

**Create `hooks/useAutoAdvance.ts`:**
- Manage auto-advance timer based on track duration
- Calculate remaining time
- Trigger advance callback
- Expose: `{ isAdvancing, cancel }`

**Create `hooks/useScrobbleScheduler.ts`:**
- Handle scrobble threshold timing
- Track scrobbled tracks to prevent duplicates
- Submit scrobble at correct threshold
- Expose: `{ scheduleScrobble, isScheduled }`

**Create `hooks/useSessionActions.ts`:**
- Consolidate play/pause/skip/end actions
- Handle API calls with error handling
- Return loading states and error messages
- Expose: `{ play, pause, skip, end, isLoading, error }`

#### 2.2 Create Sub-components

**Create `components/SessionControls.tsx`:**
- Primary controls (play/pause, skip, back)
- Secondary controls (scrobble now, end session)
- Focus on user interaction
- Props: session state, action handlers

**Create `components/SessionProgress.tsx`:**
- Progress bar and time display
- Elapsed/remaining time
- Visual progress indicator
- Props: elapsedMs, durationMs

**Create `components/SessionTrackInfo.tsx`:**
- Current track display
- Album art
- Track metadata (title, artist, position, side)
- Props: track, release

**Create `components/SideCompletionModal.tsx`:**
- Already exists, ensure it's properly integrated
- Keep existing functionality

#### 2.3 Refactor Session.tsx
- Use extracted hooks
- Compose sub-components
- Reduce to ~150 lines
- Focus on orchestration, not implementation
- Improve readability

#### 2.4 Add Tests
- Unit tests for all custom hooks
- Test timer accuracy and persistence
- Test auto-advance logic
- Test scrobble scheduling
- Integration tests for Session page

### Validation
- All existing tests pass
- New tests added for hooks
- Session functionality unchanged
- TypeScript passes
- Knip passes
- Manual testing of session flows

---

## Phase 3: API & Error Handling

**Priority:** MEDIUM - Developer Experience & Reliability  
**Estimated Time:** 1-2 days  
**Impact:** Consistent patterns, better error handling

### Objectives
- Centralize API state management
- Implement consistent error handling
- Add retry logic for transient failures
- Create reusable API hooks

### Tasks

#### 3.1 Create API Hooks

**Create `hooks/useApiQuery.ts`:**
- Generic hook for GET requests
- Automatic loading/error/data states
- Optional caching support
- Automatic retries with exponential backoff
- TypeScript generics for response types
- Integration with apiFetch

**Create `hooks/useApiMutation.ts`:**
- Generic hook for POST/PUT/DELETE/PATCH
- Loading/error states
- Optimistic updates support
- Automatic rollback on error
- Success/error callbacks

#### 3.2 Implement Error Boundaries

**Create `components/ErrorBoundary.tsx` wrapper:**
- Global error boundary for route-level errors
- Display user-friendly error messages
- Log errors for debugging
- Provide recovery actions (retry, go home)

**Add error boundaries in App.tsx:**
- Wrap each route with error boundary
- Provide route-specific fallback UI
- Preserve navigation on errors

**Create `components/ErrorMessage.tsx`:**
- Reusable error display component
- Consistent styling
- Clear call-to-action
- Dismissible with proper ARIA

#### 3.3 Add Retry Logic
- Implement exponential backoff (1s, 2s, 4s, 8s)
- Max 3 retries by default
- Retry on network errors and 5xx status
- Don't retry on 4xx client errors
- Show retry attempts to user

#### 3.4 Create Shared Components

**Create `components/LoadingSpinner.tsx`:**
- Consistent loading indicator
- Proper ARIA labels
- Size variants (small, medium, large)
- Replace inline spinner code

**Create `components/LoadingState.tsx`:**
- Full-screen/section loading states
- Optional skeleton loader
- Proper role="status" and aria-live

#### 3.5 Refactor Existing Components
- Replace manual fetch calls with useApiQuery
- Replace manual mutations with useApiMutation
- Remove duplicate error handling code
- Use shared Loading/Error components
- Add proper runtime validation with Zod

### Validation
- All API calls use new hooks
- Error boundaries catch and display errors
- Retry logic works correctly
- All tests pass
- TypeScript passes
- Knip passes
- Test network error scenarios

---

## Phase 4: UX Polish

**Priority:** MEDIUM - User Experience Enhancement  
**Estimated Time:** 1-2 days  
**Impact:** Improved perceived performance and usability

### Objectives
- Improve loading experience
- Add optimistic UI updates
- Enhance empty states
- Improve state persistence

### Tasks

#### 4.1 Replace Spinners with Skeletons

**Create `components/Skeleton.tsx`:**
- Animated skeleton loader
- Variants for text, image, card
- Composable skeleton components

**Create skeleton variants:**
- `CollectionSkeleton.tsx` - Grid of album cards
- `ReleaseSkeleton.tsx` - Album art + tracklist
- `SessionSkeleton.tsx` - Now playing layout

#### 4.2 Implement Optimistic Updates
- Session controls (play/pause/skip)
- Track scrobbling
- Collection interactions
- Rollback on error with user notification

#### 4.3 Enhance Empty States

**Improve Collection empty state:**
- Show connection instructions inline
- Visual icon and clear CTA
- Contextual messaging based on auth state

**Improve Search empty state:**
- "No results" with search tips
- Suggest alternative queries
- Clear filters button if applicable

**Improve Session empty state:**
- Already good, minor polish
- Add recently played quick-start

#### 4.4 Improve State Persistence
- Simplify session timer persistence
- Store minimal state server-side
- Compute elapsed on load from server timestamp
- Reduce sessionStorage complexity

#### 4.5 Add Offline Detection

**Create `hooks/useOnlineStatus.ts`:**
- Detect online/offline state
- Show banner when offline
- Queue actions for retry when back online

**Add offline banner:**
- Non-intrusive notification
- Clear messaging
- Auto-dismiss when online

#### 4.6 Preserve Navigation State
- Persist Collection search query/filters in URL
- Restore scroll position on back navigation
- Maintain sort preferences

#### 4.7 Extract Format Utilities

**Create `shared/src/utils/formatting.ts`:**
- `formatDuration(seconds)` - mm:ss format
- `formatTime(milliseconds)` - mm:ss format
- `formatDate(timestamp)` - readable dates
- `formatYear(year)`
- Share across worker and web

### Validation
- Skeleton loaders render correctly
- Optimistic updates work with rollback
- Empty states show proper messaging
- State persists across navigation
- Offline detection works
- All tests pass
- TypeScript passes
- Knip passes
- Manual UX testing

---

## Quick Wins (Parallel to Phases)

These can be implemented quickly alongside phases:

1. Fix Tailwind class: `max-w-[220px]` → `max-w-55`
2. Extract magic numbers to constants
3. Add descriptive alt text to all images
4. Create shared format utilities
5. Organize imports consistently

---

## Success Metrics

### Technical Metrics
- **Test Coverage:** Maintain 95%+ on shared, improve web/worker
- **Bundle Size:** Monitor and keep under target
- **TypeScript:** 100% strict mode, zero errors
- **Knip:** Zero dead code
- **Build Time:** No significant regressions

### Accessibility Metrics
- **WCAG 2.2 Level AA:** 100% compliance
- **Keyboard Navigation:** All functions accessible
- **Screen Reader:** All content/actions announced
- **Color Contrast:** All elements pass 4.5:1 or 3:1
- **Touch Targets:** 100% meet 44×44px minimum

### UX Metrics
- **Session Component:** <200 lines (from 500+)
- **Loading States:** <100ms perceived initial load
- **Error Recovery:** Clear path to resolution
- **Offline Support:** Graceful degradation

---

## Rollback Plan

If any phase causes issues:

1. **Git Strategy:** Commit after each completed phase
2. **Branch per Phase:** `refactor/phase-1`, `refactor/phase-2`, etc.
3. **Feature Flags:** Use for risky changes (optional)
4. **Validation Gates:** Must pass before merging to main

---

## Notes

- Each phase is independent where possible
- Phases can overlap for efficiency
- Quick wins can be done in parallel
- All changes must include tests
- Documentation updated as we go
- Monitor bundle size throughout
