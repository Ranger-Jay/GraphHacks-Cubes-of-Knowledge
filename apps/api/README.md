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

## Dropped graph socket

Closing FalkorDB emits a client `error` after the failed query. The startup swallows that event so the process stays up and the read route can return 503 with empty evidence. The next read opens a new client. This is not a Docker or Cloud claim.

## Disposable read proof

`node --test tests/api/startup-read.test.mjs`

That file starts a disposable FalkorDB when the `falkordblite` package can be imported. The package is not a workspace dependency. Without it, the graph case skips. `CUBES_STARTUP_GRAPH=1` makes that skip a failure. On this Windows host the proof set `CUBES_ALLOW_WSL_FALKOR=1` and used WSL `falkordblite` 0.10.0. Do not point the test at a hosted database.

The other files under `tests/api` use doubles. They are not this proof.
