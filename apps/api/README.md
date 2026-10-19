# API process

`node apps/api/dist/server.js` listens on `API_HOST` and `API_PORT` (default `127.0.0.1:8787`). Leave the host on loopback. This process does not record an approval and does not return 201.

## Sessions

The variable name is the principal. The token text does not select a role, a tenant, or a release, and neither does a request header.

| Variable | Server principal |
| --- | --- |
| `API_OWNER_TOKEN` | `kanny`, owner |
| `API_READER_TOKEN` | `serena`, reader |
| `API_AGENT_TOKEN` | `roy`, agent. The process accepts this session and then refuses it for reads and approvals. |

Unset or empty means that principal is absent. If every variable is absent, every bearer is denied. A present token must match `[A-Za-z0-9._~-]{8,256}` and must not repeat another slot. An unusable value refuses to listen and is not written to stdout or stderr.

Mint the tokens outside this repo and put them only in the server process environment. Do not commit them or ship them in a client bundle.

The tenant is `API_TENANT_ID` only. The graph address, evidence key, and witness directory stay in their existing server variables.

## IdeaVerse routes

`GET /api/studio/ideas` and `GET /api/studio/ideas/:ideaId` accept the owner session or the reader session. `POST /api/studio/ideas/:ideaId/import` and `POST .../import-status` accept only the owner session (`API_OWNER_TOKEN`). The dev proxy still injects only `API_READER_TOKEN` and cannot authorize an import. These routes authenticate before a body read or a graph call. A confirmed import is returned only after a fresh overview agrees with the receipt. A null workspace revision, a failed read-back, or `REJECTED` / `AMBIGUOUS_IDENTITY` is not success. `import-status` does not write. No route returns 201.

The tenant is still `API_TENANT_ID`. Without that id the routes answer 503 and do not claim a saved idea.

## Graph status

`GET /api/graph/status` calls the graph lane's `graphHealth` read. No session is required, and the response has no release, evidence, or token fields. HTTP 200 `AVAILABLE` with `ready: true` means that read returned at least one `Release`. A refused connection is 503 `CONNECTION_FAILED`. An empty graph or a failed read is 503 `QUERY_FAILED`. `NOT_IMPLEMENTED` remains only when `createApiServer` is called without a status probe. This is not a Docker, hosted, or Cloud claim.

## Dropped graph socket

Closing FalkorDB emits a client `error` after the failed query. The startup swallows that event so the process stays up and the read route can return 503 with empty evidence. The next read opens a new client. This is not a Docker or Cloud claim.

## Disposable read proof

`node --test tests/api/startup-read.test.mjs`

That file starts a disposable FalkorDB when the `falkordblite` package can be imported. The package is not a workspace dependency. Without it, the graph case skips. `CUBES_STARTUP_GRAPH=1` makes that skip a failure. On this Windows host the proof set `CUBES_ALLOW_WSL_FALKOR=1` and used WSL `falkordblite` 0.10.0. Do not point the test at a hosted database.

The other files under `tests/api` use doubles. They are not this proof.
