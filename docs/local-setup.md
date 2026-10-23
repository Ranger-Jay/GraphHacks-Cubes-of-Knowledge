# Local setup and verification

Node.js **22.12+ or 24** (24 recommended; .nvmrc), npm workspaces, TypeScript, official FalkorDB client, React/Vite and Three.js. Exact package versions and integrity hashes are in package-lock.json. Dependencies were resolved from the registry during kickoff; do not change the shared lockfile without coordination.

The checkout below targets the final-art candidate branch, which contains the accepted #64 stack plus the disconnected second cube.

```sh
git clone https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge.git
cd GraphHacks-Cubes-of-Knowledge
git switch buddy/approved-art-integration-v058
npm ci
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead of cp. Environment values are local; never commit .env. API scripts load the root .env using Node's native env-file support.

Graph evidence signing requires a server-only `GRAPH_EVIDENCE_KEY` in each environment. Generate a separate key with:

```sh
node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

Store the output only in local/server secret configuration. Do not prefix it with `VITE_`, include it in the browser bundle, or reuse the disposable CI key. An unset key must fail closed; adding the variable does not establish graph integration, revocation enforcement or rollback protection. Rotation/re-signing needs the graph lane's migration procedure and independent verification.

The graph lane's rollback guard also requires a server-only `GRAPH_WITNESS_DIR`: create an owner-only durable directory outside FalkorDB's data directory, then set its absolute path in server configuration. For a local sandbox, `.local/graph-witness/` is gitignored; it is not a production storage recommendation. Keep the witness across server restarts and separate from graph-only snapshot restoration. A missing, corrupt or interrupted witness must fail closed; never silently rebuild it from the current graph or delete/reinitialize it to make a failed verification pass. Initialization/recovery uses the graph lane's explicit operator procedure. Whole-host rollback that also restores the witness remains a separate limit. CI alone uses a disposable witness directory alongside its disposable database and signing key, removed at test teardown.

Start local Docker on a host where Docker is actually installed:

```sh
npm run graph:up
```

Database: 127.0.0.1:6379. FalkorDB Browser: http://127.0.0.1:3001. This is a loopback-only, unauthenticated development configuration with a named /data volume and AOF. It has **not** been runtime-verified in the bootstrap host. Record a verified image digest and restart proof through technical issue #2. Docker image defaults to latest until that verification lands. `.env` client credentials do not enable server auth automatically; see [runtime baseline](../infra/falkordb/README.md).

The runtime verified for this project is the pinned FalkorDBLite 0.10.0 embedded server (see CI graph-live); the Docker configuration above is not runtime-verified.

### Linux alternative: the pinned embedded vendor server

The independent reviewers and CI used **FalkorDBLite 0.10.0**, not Docker. The following foreground launcher uses that package's vendor server and module with the same loopback/AOF configuration as `scripts/ci-graph-tests.py`, but keeps its data directory for a manual demo. It is a setup recipe adapted from the verified harness, not an additional independent execution claim. Use a free port; do not start over an existing database.

```sh
python3 -m venv .venv-falkor
. .venv-falkor/bin/activate
python -m pip install falkordblite==0.10.0
python - <<'PY'
import os
from pathlib import Path
import redislite
binaries = Path(redislite.__file__).resolve().parent / "bin"
server = binaries / "redis-server"
module = binaries / "falkordb.so"
if not server.is_file() or not module.is_file():
    raise SystemExit("FalkorDBLite vendor binaries unavailable on this platform")
data = Path.home() / ".cubes-of-knowledge-demo-db"
data.mkdir(mode=0o700, exist_ok=True)
os.execv(str(server), [
    str(server), "--bind", "127.0.0.1", "--port", "6379",
    "--dir", str(data), "--appendonly", "yes", "--loadmodule", str(module)
])
PY
```

Keep this terminal running. In the root `.env`, use `FALKORDB_HOST=127.0.0.1`, `FALKORDB_PORT=6379`, `FALKORDB_TLS=false`, empty username/password, and a fresh graph name for your own demo. Preserve both this database directory and the separately configured witness directory across restarts. Windows users need a supported Linux/WSL environment for this recipe, or their own Docker/Cloud configuration. No reviewed recipe assumes a Windows-native vendor binary.

On a **new disposable local graph**, set `GRAPH_EVIDENCE_KEY`, `GRAPH_WITNESS_DIR`, and a freshly generated `API_READER_TOKEN` in the root `.env`. The example sets `API_TENANT_ID=t-wad`; that server-derived scope is required for release analysis. Use the token format in [API sessions](../apps/api/README.md#sessions), and leave all credentials outside the browser. Initialize only the fresh graph/witness pair:

```sh
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts seed --init-witness
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts seed-ideaverse
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts analyze rel-wad
```

The IdeaVerse command should print `{"seedVersion":"wad-ideaverse@1","tenantId":"t-wad","ideas":100,"workspaceRevision":0,"edges":100}` on a fresh graph. It loads and verifies the checked-in manifest and all file hashes; nothing is imported into the cube. It takes an optional tenant id (default `t-wad`, matching `API_TENANT_ID`) and no witness/reset flags. The command uses the configured graph connection; keep it pointed at this disposable loopback setup. It does not initialize the licensing witness or establish clearance. For the local studio crew and profile fixtures, also run `seed-studio` and `seed-agent-profiles` through the same CLI; their display metadata does not establish agent execution or memory.

The base release analysis should return current-cut `GAP`, with stale v3 evidence for Basement Hum and current evidence for Night Drive. Do not initialize, reset or seed an existing/shared graph to follow these instructions. See [seed/witness operator procedures](../graph/seed/README.md) for later runs and recovery.

In two separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Web: http://127.0.0.1:5173 (analysis route: `/#/releases/rel-wad`). API: http://127.0.0.1:8787. Vite proxies /api locally; no graph credentials go to the web app. `/api/health` deliberately retains `BOOTSTRAP` and `ready=false` as process liveness metadata. `/api/graph/status` is the separate real graph probe: 200 AVAILABLE after a successful read, otherwise 503 UNAVAILABLE. Its unauthenticated response discloses the configured graph name. Release analysis requires an authorized server session. Vite preview serves static files only; it does not supply a production API/proxy.

### Web to API session (dev only)

The shipped API answers `/api/releases/:id/analysis` only to a bearer token (see [API sessions](../apps/api/README.md#sessions)). The browser holds no credential. In dev, the Vite proxy (`apps/web/dev-proxy.ts`, wired in `apps/web/vite.config.ts`) adds `Authorization: Bearer <API_READER_TOKEN>` to every `/api` request and drops any `Authorization` header the page sent. The token is read in the Vite Node process from the environment or the root `.env`, has no `VITE_` prefix, and is never passed to `define`, so it is not in the client bundle.

1. Mint a reader token outside the repo and put the same value in the API process and the Vite process (the root `.env` serves both): `API_READER_TOKEN`.
2. If it is unset or malformed, the proxy warns without printing the value and injects nothing. The web shell then shows "Not authorized (HTTP 401)" and no graph answer.
3. A 403 shows "Not authorized (HTTP 403)". A network failure or a dead upstream behind the proxy (HTTP 502/504) shows an "API unreachable" error. None of these show clearance or evidence.

Limits. This is a dev convenience, not an auth design: anyone who can reach the dev server on 127.0.0.1:5173 reads as the reader, so leave the host on loopback. `vite preview` and a production build have no proxy and no credential, so a deployed web app needs its own session design before it can read the API. That is unproven here.

Independent combined-head browser proof is recorded for code commit fd71b7bcc94c417b3d3677fcb79d647cc9306ea8. Both `CONNECTION_FAILED` and `QUERY_FAILED` indicate graph unavailability. The entrant separately reported a local API reading the authorized FalkorDB Cloud smoke graph; that does not establish a publicly hosted application or independent Cloud reproduction.

Optional v038 local owner rehearsal adds a separate, disabled-by-default IdeaVerse alias while
the ordinary `/api` path stays reader-only. Setup, request guards and held integration gates
are in [owner-rehearsal transport](owner-rehearsal-v038.md). The combined candidate binds the studio UI and independently verifies the owner import/read-back journey.

Web unit tests: `npm run test:web`; included in `npm run verify` along with the API, scene, bootstrap and harness suites.

The database and provider credentials remain server-side. Model execution defaults to disabled and has no provider key. No private team records or production diaries belong in this public repository.

## Verification and integration

```sh
npm run check
npm test
npm run build
```

`npm run verify` combines those bootstrap gates. The scaffold test starts a real local HTTP process and checks that liveness does not claim graph readiness and protected product routes do not silently succeed. These checks do not prove a graph-backed agent or UI. GitHub CI runs those gates with every branch-present lane suite (API, web and scene) on Node 22 and 24. A required named suite fails when missing or empty; missing optional lanes are explicitly reported as absent, never accepted.

`npm run test:integration` runs the actual `tests/graph` files serially, with a distinct graph namespace per file. It fails when that suite is absent or empty, or when any test fails. Use a disposable test database: graph tests seed/mutate/delete test graphs. Do not run them against a shared or production instance. When graph tests exist on a PR branch, the `graph-live` CI job installs pinned FalkorDBLite 0.10.0, requires the shipped API startup/outage/reconnect test with `CUBES_STARTUP_GRAPH=1`, then launches a fresh loopback vendor server through `scripts/ci-graph-tests.py`. For the same local proof after installing that Python package, run `CUBES_STARTUP_GRAPH=1 npm run verify` and `python3 scripts/ci-graph-tests.py`. An ordinary `npm test` can skip the live startup case when no launcher is installed; that skip is not acceptance. It uses a temporary data directory and a disposable randomly generated evidence key. This is real embedded/binary graph execution, not Docker/Cloud parity, deployment persistence, browser E2E or a working LLM-agent claim. With no graph suite, that CI job is explicitly skipped; the manual integration gate still fails. The separate Docker/Nexus proof remains runtime issue #2. Do not substitute unit mocks or a skipped green test for live acceptance. Record exact-SHA graph, authorization, persistence, browser and model-call evidence in independent reviews. Install failures and unavailable hosts remain explicit blockers.


## Data model and Cypher status

Implemented graph schema and seed model Release → current Cut → used Track → version-scoped License → immutable source references. See [schema](../graph/schema/README.md), [seed](../graph/seed/README.md), and [named queries](../graph/queries/README.md). The graph operator can add the optional synthetic current-cut license bundle; the API does not expose that write. Every asserted answer must cite its source and actual returned graph path. Missing scope/coverage stays UNKNOWN. Persistent agent handoff and memory are not implemented in this candidate.

## Engineering discipline

One major feature per commit. Feature versions use v001.00, v002.00, etc.; follow-up fixes, tests, and documentation use decimal revisions such as v002.001. Coordinate version allocation before committing. Preserve feature commits; do not squash independent changes.

Public issues and pull requests contain technical work in one unified project voice. Team planning happens outside this repository. Author-created code requires independent review; human release approval remains required.

