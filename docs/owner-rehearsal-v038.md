# Local owner-rehearsal transport (v038)

This review slice adds a guarded development proxy alias. It does not mount the studio,
derive browser effective access, integrate comets/audio, or establish a completed graph import journey.
Parent: partial candidate `5d36e011772d4dd269c56aa67b38f2ee8becad48` (PR #54).

## Operator setup

The default is `API_OWNER_REHEARSAL=0`. `/api` retains the existing server-held **reader** identity,
even when the owner alias is enabled. The reader's API write denial is unchanged.

For an explicitly authorized rehearsal against a **disposable synthetic local database**:

1. Configure distinct opaque `API_OWNER_TOKEN` and `API_READER_TOKEN` values in the API and Vite
   Node processes (the root uncommitted `.env` can supply both). Keep the existing server tenant,
   signing key and witness configuration. Do not use `VITE_` variables for secrets.
2. Set `API_OWNER_REHEARSAL=1` in the Vite process and restart `npm run dev:web`.
3. Keep the Vite bind address exactly `127.0.0.1` and `strictPort=true`. A `--host` override to
   another interface fails startup while the alias is enabled.
4. Use the browser at `http://127.0.0.1:5173` (or `http://localhost:5173`). The browser needs no token.

An absent/invalid owner token, an invalid flag, or a token reused in the reader/agent slot
fails startup with a value-free error. Enabling this alias grants the local development origin
the owner's narrow IdeaVerse transport; it is not individual user authentication. Local
processes are trusted operators. Do not expose or tunnel this dev server to other machines.
Hosted sessions and deployment remain separate work.

## Exact alias surface

| Browser request | API destination |
| --- | --- |
| GET `/api/owner-rehearsal/studio/ideas` | GET `/api/studio/ideas` |
| GET `/api/owner-rehearsal/studio/ideas/:id` | GET `/api/studio/ideas/:id` |
| POST `/api/owner-rehearsal/studio/ideas/:id/import` | POST `/api/studio/ideas/:id/import` |
| POST `/api/owner-rehearsal/studio/ideas/:id/import-status` | POST `/api/studio/ideas/:id/import-status` |

The existing client can later be bound with
`createStudioClient(undefined, '/api/owner-rehearsal/studio')`. This document is not a claim
that any product code currently constructs that binding. Choosing an alias URL never bypasses
API authentication: the API still authenticates its configured owner slot and validates the request.

Disabled alias and disallowed routes/methods/query strings/encoded identifiers return 404
before proxying. Other `/api` requests still use the reader proxy; there is no owner alias
for approvals, agent tools, arbitrary Cypher or general API access.

Enabled requests must have a loopback peer and the actual local port with Host `127.0.0.1`
or `localhost`. An Origin, when supplied, must exactly match that Host and HTTP origin.
Cross-site/same-site Fetch Metadata is rejected. POST additionally requires the matching
Origin and `Content-Type: application/json`; browser forms and Origin-free writes are denied.
No credential is injected into a rejected request. Incoming browser Authorization is removed
before the server-held token is added. Refusals use no-store and contain no credential.

## Author verification

- `npm ci`, `npm run check`, `npm test`, `npm run build` (via `npm run verify`).
- `node --import ./tests/web/register.mjs --test tests/web/owner-rehearsal.test.ts`:
  configuration refusals, route allowlist, peer/host/origin constraints, and **real Vite HTTP
  proxy transport** in disabled/enabled modes. The upstream in this test is explicitly a test
  HTTP server: it records the injected identity, not a graph import or a working UI.
- Existing `/api` reader injection tests remain intact, including browser-header replacement.
- A production web build with disposable owner/reader tokens and the flag enabled completed;
  neither token appeared in the emitted files or captured build output. Tokens were never printed.

Independent review remains required. Live FalkorDB import/read-back, browser fetch behaviour,
effective-access binding, UI/comet receipt effects, audio, graph stop/restart and hosted
deployment are not proved by the proxy tests. The inherited flaky live-startup shutdown gate
is not repaired in this slice. The owner flag configures transport only; it is not evidence
that the API accepted a session or that an import committed.
