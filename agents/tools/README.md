# Bounded agent tools (v009)

Implementation: `packages/graph/src/agent-tools.ts` (`runTool`, `TOOL_DEFINITIONS`). Tests: `tests/graph/agent-tools.test.ts`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `graph_status` | none | whether the graph is reachable and seeded |
| `release_clearance` | `releaseId` | ESTABLISHED / GAP / UNKNOWN, per-track evidence, proposed actions (always human-approved), verified source excerpts |
| `source_excerpt` | `refId` | one verified excerpt: path, SHA-256, code-point offsets, exact text |

Rules:
- **Named reads only.** No tool accepts Cypher or writes to the graph; the tests check that node and edge counts are unchanged after every tool.
- **Closed arguments.** Schemas are `additionalProperties: false`; ids must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Anything else returns `INVALID_ARGUMENTS`.
- **Identity from the server.** `tenantId` and `agentId` come from the server-side `ToolContext`, never from arguments. The agent must be a `MEMBER_OF` the tenant with role `AGENT`; otherwise `FORBIDDEN`.
- **Honest failure.** A graph outage returns `UNAVAILABLE` with no data or sources. A missing release or reference returns `NOT_FOUND`. A reference whose text no longer matches its file is never returned.
- **Source-linked.** Every claim in a result summary carries reference ids, and the result includes the verified excerpts.

`TOOL_DEFINITIONS` are provider-neutral JSON-schema tool specs, ready to hand to a model once one is configured. Running these tools deterministically is **not** evidence of LLM agent behavior; a real model run (model id, cost, tool path) must be recorded separately before that claim is made.
