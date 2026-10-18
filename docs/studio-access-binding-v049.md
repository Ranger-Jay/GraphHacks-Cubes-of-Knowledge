# Studio access binding (v049)

Binds the reviewed server access response (v048, `docs/session-access-v048.md`) into the existing mounted
studio, so Add enables ONLY after an exact, consistent OWNER capability from the SAME guarded owner alias
used for imports. Default UNKNOWN; Add stays off until the server says OWNER through that alias.

## What it is

- `apps/web/src/studio/accessLoader.ts` — credential-free capability fetch + validation + live store.
- `apps/web/src/studio/studioController.ts` — invalidation when OWNER is lost while staying READY (v049.02).
- `apps/web/src/studio/mountedStudio.ts`, `StudioPanel.tsx`, `App.tsx` — plumbing only: the binding carries
  the store, the panel subscribes to it and reports its live access to the controller, App passes the store.
- Tests: `tests/web/studio-access-loader.test.ts`, `tests/web/studio-access-loss.test.ts`,
  `tests/web/studio-binding-access.test.tsx`, `tests/web/studio-access-lifecycle.test.tsx` (effect-running:
  JSDOM + `createRoot` + `act`, real-DOM Add-button assertions).

Untouched: Gem scene files, graph/schema, provider, root version (except the v049.08 JSDOM
devDependency + coordinated lockfile change, authorized for the effect-running tests), `main.tsx`, the import
success authority (one card + server receipt + fresh read-back), and every existing import guard.

## Resolution

1. Alias first: `GET /api/owner-rehearsal/session/access`. Valid OWNER enables Add; valid READER reads only.
2. Alias 404 (missing/disabled alias) falls back to ordinary `GET /api/session/access`, CAPPED at READER:
   an OWNER claim from the ordinary transport contradicts that transport (it carries only the reader
   token) and is treated as malformed. The fallback can never authorize the absent owner transport.
3. Alias 401/403/malformed/unexpected/network loss fail closed with NO fallback: 403 is an explicit
   refusal (DENIED); anything else is unconfirmed (UNKNOWN). Add stays off in both.

## Fetch + validation

- `GET` only, `credentials: 'omit'`, `cache: 'no-store'`, `Accept: application/json`, no body, no query.
  The browser holds no credential and sends none; identity comes from the server-held token the dev
  proxy injects, exactly as the import routes do. No browser profile, role, or local flag can grant access.
- Shape: exactly `{ access, canReadIdeas, canImportIdeas }` with OWNER = true/true and READER = true/false.
  Any other shape, type, access value, or inconsistent boolean pair is malformed and never trusted.

## Staleness

- The store carries a sequence/generation guard: every refresh captures the generation at start and
  applies only while it is still current. A delayed OWNER can never overwrite a newer denial or clear.
- Phase change / re-query: leaving READY clears the stale capability (and invalidates old access
  responses via the generation bump); entering READY re-resolves from the server.
- Unmount: the panel CLEARS the store and the controller env resets to CHECKING/UNKNOWN. A delayed
  response after the clear is discarded by the generation guard; nothing stale lands after unmount.

## Lifetime: clear vs dispose (v049.08–v049.11 repair)

The store outlives the panel (the binding is created once in `main.tsx`; the panel mounts/unmounts with
the release route), so a route leave and a permanent teardown are different operations:

- `clear()` — REUSABLE. Forgets the capability (UNKNOWN), invalidates in-flight responses via the
  generation bump, drops the dedupe marker so the next refresh starts a fresh request. The store stays
  usable: a later mount re-resolves with a fresh GET. The panel calls this on unmount and on leaving
  READY. Clear never revives a disposed store.
- `dispose()` — PERMANENT teardown for discarding the binding, never for a route leave. Resets the
  cached capability to UNKNOWN first (a disposed store never exposes a stale OWNER), notifies
  still-subscribed readers of UNKNOWN, drops subscribers, and refuses all later writes: `refresh()` after
  disposal performs no fetch and resolves UNKNOWN.
- `refresh()` — re-resolves from the server unless the store is disposed. Concurrent calls share one
  in-flight request.
- StrictMode: setup/cleanup/setup replay stays usable. Cleanup clears (reusable), the replayed setup
  refreshes with a fresh GET, and the first response is discarded by the generation guard. On the pre-fix
  code the cleanup disposed the store, so the replayed setup no-op'd and the store bricked at UNKNOWN.

## Capability loss during an import

If OWNER is lost while staying READY, the controller abandons every in-flight import session exactly as
leaving READY does: the late completion is discarded, no Added, no `onAdded`, the attempt stays pinned
for a later reconcile. Pool/detail reads are reader data and stay valid — their sequences are untouched.
Import refusal still retains DENIED behavior via the controller's existing latch.

## Success authority (unchanged)

One existing card + the reviewed controller's server receipt + fresh read-back remain the ONLY success
authority. No direct ADDED event, no optimistic fade, no new success path.

## Limits (honest)

- No CI status claimed; no acceptance claimed; no live Cloud involvement; v047 is NOT included.
- The panel's React effects now run for real in `tests/web/studio-access-lifecycle.test.tsx` (JSDOM +
  `createRoot` + `act`, synthetic scripted fetch fixtures, real-DOM Add-button assertions): unmount/
  remount across a server 403, valid OWNER return, loaded-OWNER disposal, StrictMode replay, and an
  in-flight refresh abandoned on unmount. The SSR binding tests still drive exactly the calls the
  effects perform and then render the real panel.
- The composition (real browser -> real Vite alias -> real API server, end to end) is not exercised in
  one test; the halves are covered separately (v048 transport tests + these binding tests). Real-browser
  proof is a later, separately owned step.
