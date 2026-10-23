# Cubes of Knowledge

**A source-linked studio evidence workspace built on FalkorDB.**

## Explore the live demo

- **Live demo:** [Open the interactive release analysis](https://graphhacks-cubes-of-knowledge.vercel.app/#/releases/rel-wad).
- **Demo video:** [Watch the walkthrough on YouTube](https://youtu.be/2Uja4ZloU0U).
- **Project write-up:** [Read the Graph Hacks story](https://www.linkedin.com/pulse/hackathon-falkordb-jay-r-gq5xe).

Explore the Company Cube, inspect its Solar Core graph and follow the returned paths to source records. The red comparison cube shows a disconnected workspace. Zoom with the mouse wheel, touch pinch or **+ / −** controls; **Show both cubes** restores the overview. Audio starts muted; select **MUTED** to enable recorded voices and interaction sounds.

The synthetic release intentionally reports **GAP**: *Basement Hum* is **STALE** for Cut v4, while *Night Drive* is **VERIFIED**. These results come from the live API and FalkorDB, not the visual effects.

**Hosted explanations are enabled:** select **Explain the current clearance** to request an optional explanation of the current evidence. Opening an agent does not automatically call a model. Explanations cannot change clearance or permissions. The public demo remains read-only; imports are disabled.

## Production source and verification

The [reviewed production implementation](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/tree/a57bca5702863155ce24accf934e972cf0a99baf) includes the restored hosted demo and presentation updates. The current release line is [`buddy/vercel-public-demo-v061`](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/tree/buddy/vercel-public-demo-v061). See [camera, presentation and audio behavior](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/blob/a57bca5702863155ce24accf934e972cf0a99baf/docs/design/presentation-v064.md) and [Explain configuration and boundaries](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/blob/a57bca5702863155ce24accf934e972cf0a99baf/docs/talker-v052.md).

Validation for this implementation: **315 offline tests passed**, **15 hosted-runtime regression tests passed**, independent review completed, and hosted Node 22/24 and live-graph checks passed. Visuals, cube separation, zoom and speaker quality were also confirmed by the project owner on a real device. These checks do not establish a live model-call result.

**Developers:** use the release line above for the working implementation. The default branch retains the early scaffold; its historical documentation follows.

---

## Earlier scaffold documentation

**A company brain built on FalkorDB, with traceable decisions and persistent agent memory.**

Canonical product description; implementation status and acceptance gates are recorded below.

A Graph Hacks entry exploring a fictional studio's current-cut licensing, evidence, authorized actions, and recoverable agent state through FalkorDB.

## Status

Typed workspace/configuration bootstrap v003.002. No working graph integration, authorization flow, agent execution, deployment, or prize qualification is claimed yet. The scenario uses synthetic data from Warnings After Dark Studios. The development API exposes liveness and an honest unavailable graph status; the browser renders a scaffold notice.

## Required demonstration

- Follow current release → cut → track → license/version → source evidence.
- Distinguish stale clearance, unresolved evidence, denied actions, and database unavailability.
- Enforce Kanny's owner permissions and Serena's limited access on the server.
- Persist an authorized agent handoff and recover it in a fresh session.
- Stop and reconnect the real graph database; never substitute a simulated successful answer.

## Stack and setup

Node.js **22.12+ or 24** (24 recommended; .nvmrc), npm workspaces, TypeScript, official FalkorDB client, React/Vite and Three.js. Exact package versions and integrity hashes are in package-lock.json. Dependencies were resolved from the registry during kickoff; do not change the shared lockfile without coordination.

```sh
git clone https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge.git
cd GraphHacks-Cubes-of-Knowledge
npm ci
cp .env.example .env
npm run verify
```

On PowerShell, use `Copy-Item .env.example .env` instead of cp. Environment values are local; never commit .env. API scripts load the root .env using Node's native env-file support.

Start local Docker on a host where Docker is actually installed:

```sh
npm run graph:up
```

Database: 127.0.0.1:6379. FalkorDB Browser: http://127.0.0.1:3001. This is a loopback-only, unauthenticated development configuration with a named /data volume and AOF. It has **not** been runtime-verified in the bootstrap host. Record a verified image digest and restart proof through technical issue #2. Docker image defaults to latest until that verification lands. `.env` client credentials do not enable server auth automatically; see [runtime baseline](infra/falkordb/README.md).

In two separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Web: http://127.0.0.1:5173. API: http://127.0.0.1:8787. Vite proxies /api locally; no graph credentials go to the web app. /api/health returns BOOTSTRAP with ready=false; /api/graph/status returns HTTP 503 UNAVAILABLE / NOT_IMPLEMENTED until a real query adapter lands. Other product routes are not implemented. Vite preview serves static files only; it does not supply a production API/proxy.

The database and provider credentials remain server-side. Model execution defaults to disabled and has no provider key. No private team records or production diaries belong in this public repository.

## Verification and integration

```sh
npm run check
npm test
npm run build
```

`npm run verify` combines those bootstrap gates. The scaffold test starts a real local HTTP process and checks that liveness does not claim graph readiness and protected product routes do not silently succeed. These checks do not prove a graph-backed agent or UI. GitHub CI runs the same gates on Node 22 and 24.

`npm run test:integration` deliberately exits nonzero until the real graph integration suite is implemented. Do not substitute a unit mock or a skipped green test for that gate. Record exact-SHA graph, authorization, persistence, browser and model-call evidence in independent reviews. Install failures and unavailable hosts remain explicit blockers.

## Repository layout

| Path | Purpose |
| --- | --- |
| apps/api | Node/TypeScript API; authorization, approvals and audit events |
| apps/web | React/Vite application; scene module isolated under src/scene |
| packages/contracts | Shared evidence, status, approval, handoff and scene transport types |
| packages/graph | Official-client adapter implementation lane; empty placeholder until implemented |
| graph/schema, graph/seed, graph/queries | Synthetic schema/data, source provenance and named Cypher |
| agents/tools, agents/memory | Bounded real tool execution and authorized durable handoff |
| infra/falkordb | Local Docker configuration and runtime verification |
| tests | Bootstrap and lane-owned acceptance suites |
| docs/verification | Independent evidence reports |

Some owned implementation directories are created by their first feature rather than padded with empty files. Read [AGENTS.md](AGENTS.md) and [shared contract v1](docs/contracts.md) before implementation. Technical issues [#1](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/issues/1)–[#5](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/issues/5) define the first deliverables.

## Data model and Cypher status

Planned: Studio/Release → current Cut → used Track → version-scoped License/Approval → immutable source reference and authorized human; separately scoped Agent, Memory and Handoff state. **Actual schema, seed and runnable query catalog are pending issue #1**; this paragraph is not an executed model. Every asserted answer must cite its source and actual returned graph path. Missing scope/coverage stays UNKNOWN.

## Engineering discipline

One major feature per commit. Feature versions use v001.00, v002.00, etc.; follow-up fixes, tests, and documentation use decimal revisions such as v002.001. Coordinate version allocation before committing. Preserve feature commits; do not squash independent changes.

Public issues and pull requests contain technical work in one unified project voice. Team planning happens outside this repository. Author-created code requires independent review; human release approval remains required.

## Contest and assistance

Built after the permitted Graph Hacks start, October 14, 2026 at 14:31 America/New_York. Intended tracks: Company Brain, Agent Memory and Coordination, and Agents That Act on Connected Data; qualification remains subject to working evidence.

AI assistance is used. OpenAI ChatGPT/Codex assisted with this initial workspace, shared contracts, documentation and bootstrap checks. Other assistance is recorded as contributions land; the roster alone is not evidence of authored code. The human entrant is responsible for meaningful contribution, understanding, testing, and final submission. No independent review or human verification is implied by the builder's passing checks. The project has not selected a distribution license; third-party dependencies retain their own licenses.

Official references: [Graph Hacks](https://www.wemakedevs.org/hackathons/falkordb), [rules](https://www.wemakedevs.org/hackathons/falkordb/rules), [FalkorDB docs](https://docs.falkordb.com/).
