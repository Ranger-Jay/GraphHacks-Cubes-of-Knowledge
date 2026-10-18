# Session access endpoint (v048)

Server-derived effective access for the current session, so the browser controller can
enable owner UI without inventing a browser role. The browser never holds or sends a
credential; the server session kind is the only authority.

## Routes

| Caller | Browser request | Upstream request | Credential injected |
| --- | --- | --- | --- |
| Owner rehearsal | `GET /api/owner-rehearsal/session/access` | `GET /api/session/access` | Server-held owner token |
| Ordinary | `GET /api/session/access` | `GET /api/session/access` | Server-held reader token |

The ordinary path falls out of the existing `/api` dev proxy; no new code. The alias path
is one new `GET` allowlist entry in the owner-rehearsal guard set, reusing its loopback
peer, Host, Origin, Fetch-Metadata, disabled-by-default, server-injected credential, and
refusals-before-credential behavior. No other alias route changes.

## Response

`200`, `Cache-Control: no-store`, `application/json`:

- Owner: `{ "access": "OWNER", "canReadIdeas": true, "canImportIdeas": true }`
- Reader: `{ "access": "READER", "canReadIdeas": true, "canImportIdeas": false }`

No token, no principal id, no tenant, and no caller-supplied field is honored or
returned. Capabilities derive from the session kind only; there is no tenant requirement.

## Failures

- Null principal: `401 { error: { code: "UNAUTHENTICATED", message: "Session access was not read. No server session was presented.", requestId } }`
- Any other authenticated kind (agent included): `403 { error: { code: "FORBIDDEN", message: "Session access was not read. This session cannot read it.", requestId } }`

The route reuses `principalFrom` and authenticates first: 401/403 before any other work.
`GET` only; no body is read. A URL with `?` or `#` does not match and answers `404`,
as does any non-`GET` method.

## Consumption — not this slice

The browser controller's `setAccess`/`setEnv` consumption is later work. Until it lands,
the studio guard keeps its default `UNKNOWN` and Add stays off; a 401/403 from the import
route still flips the controller to `DENIED`. This slice only serves the server-derived
answer the controller will consume.

## Evidence

- API tests (`tests/api/session-access.test.mjs`): owner/reader/agent/null shapes, exact
  401/403 messages, query/fragment/POST 404s, GET body ignored, no token leakage into
  responses or server logs.
- Transport tests (`tests/web/session-access.test.ts`): real-Vite alias reports OWNER with
  owner-token injection, ordinary path reports READER with reader-token injection and
  attacker-bearer replacement, alias refusals (POST, query, trailing path, cross-origin,
  cross-site Fetch Metadata, foreign Host) never reach upstream, no token in responses.
