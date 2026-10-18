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
  `tests/web/studio-binding-access.test.tsx`.

Untouched: Gem scene files, graph/schema, provider, root version/lockfiles, `main.tsx`, the import
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
- Unmount: the store is disposed and the controller env resets to CHECKING/UNKNOWN. Delayed responses
  after disposal are discarded; nothing writes after disposal.

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
- The panel's React effects (subscribe + setEnv on store change, refresh/clear on phase, dispose on
  unmount) are covered by review, not by an effect-running test: this repo's web tests render with
  `renderToStaticMarkup` (SSR, no DOM, no effects). The integration tests drive exactly the calls those
  effects perform and then render the real panel.
- The composition (real browser -> real Vite alias -> real API server, end to end) is not exercised in
  one test; the halves are covered separately (v048 transport tests + these binding tests).
