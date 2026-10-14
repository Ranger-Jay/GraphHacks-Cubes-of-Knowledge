# Engineering rules

Read README.md and docs/contracts.md before implementation. This is a public, synthetic-data Graph Hacks project. Code, tests, docs and technical issues use one unified project voice. No internal speaker prefixes, private planning records, credentials, production diaries or real customer data.

One major feature per commit. Feature versions: v001.00, v002.00, etc. Decimal revisions for separate fixes, tests and documentation: v002.001. Allocate version identifiers through the project coordinator before committing. Use topic branches and PRs, preserve individual commits, and never squash unrelated changes. Integration/release versions are coordinator-owned; feature contributors must not edit root version or lock files independently.

## Owned paths

| Lane | Paths |
| --- | --- |
| Integration | Root files, package-lock.json, .github/, docs/contracts.md, packages/contracts/ |
| Graph | graph/schema/, graph/seed/, graph/queries/, agents/tools/, agents/memory/, packages/graph/, tests/graph/ |
| Runtime | infra/falkordb/, scripts/graph-smoke.*, tests/runtime/, docs/runtime-evidence.md |
| API | apps/api/src/, tests/api/ |
| UI | apps/web/src/ excluding scene/, tests/web/ |
| Scene | apps/web/src/scene/, apps/web/public/art/, docs/design/, tests/scene/ |
| Independent review | docs/verification/ with unique report filenames |

Coordinate shared-file/dependency/API changes before editing. Do not overwrite another lane. Acknowledge the exact bootstrap HEAD before integration.

## Acceptance

- Never self-certify authored work. Opposing engineering lane reproduces on exact SHA; independent meta-review checks the evidence; integration reconciles; human release approval is final. Bootstrap checks do not establish a working product.
- npm ci, npm run check, npm test and npm run build are bootstrap gates. Real graph changes also need npm run test:integration when that suite exists. Never replace an unavailable integration suite with a passing stub.
- Synthetic company only. Validate input, authorize on the server, parameterize named graph queries, and keep graph/provider credentials server-side. Never accept a browser-supplied role as identity.
- APPROVAL is not a LICENSE. Current cut, track, evidence and revision must agree. Reject stale approvals and duplicate/replayed mutations.
- Missing evidence, denied access, and graph outage are different states. Graph outage blocks protected mutations and yields UNAVAILABLE, never a fake successful answer or decorative graph.
- Optional model calls must genuinely execute before claiming agent behavior; default setup has no provider key. Record actual models, cost and tool paths, not simulated outputs.
- Preserve authorized handoff state; bound access by tenant, agent and human role. Prove recovery after reconnect and a fresh session.
- Decorative geometry is not evidence. Draw evidence edges only from actual returned paths; retain readable source links, keyboard/text alternatives and reduced motion.
- No paid resources, production-system changes, destructive database cleanup, merge/release/deployment or external customer actions without appropriate human authority. Flag blockers immediately; UNKNOWN stays UNKNOWN.
