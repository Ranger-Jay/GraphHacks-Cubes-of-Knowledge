# Bounded agent tools (v009)

Implementation: `packages/graph/src/agent-tools.ts` (`runTool`, `TOOL_DEFINITIONS`). Tests: `tests/graph/agent-tools.test.ts`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `graph_status` | none | whether the graph is reachable and has releases **in the caller's tenant** (never a cross-tenant count) |
| `release_clearance` | `releaseId` | ESTABLISHED / GAP / UNKNOWN, per-track evidence, proposed actions (always human-approved), verified source excerpts |
| `source_excerpt` | `refId` | one verified excerpt (path, SHA-256, code-point offsets, exact text) with `witnessed: true`, only from a graph that matches the evidence witness |

Rules:
- **Named reads only.** No tool accepts Cypher or writes to the graph; the tests check that node and edge counts are unchanged after every tool.
- **Closed arguments.** Schemas are `additionalProperties: false`; ids must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Arguments must be a plain object, and every key must be an own, declared property (inherited names such as `constructor`, `toString` or `__proto__` never count). Anything else returns `INVALID_ARGUMENTS`.
- **Identity from the server.** `tenantId` and `agentId` come from the server-side `ToolContext`, never from arguments. The agent must be a `MEMBER_OF` the tenant with role `AGENT`; otherwise `FORBIDDEN`.
- **Honest failure.** A graph outage returns `UNAVAILABLE` with no data or sources. A missing release or reference returns `NOT_FOUND`. A reference whose text no longer matches its file is never returned.
- **Witnessed evidence only (D-020).** `release_clearance` and `source_excerpt` trust the graph only when it matches the evidence witness (`GRAPH_WITNESS_DIR`). Otherwise `release_clearance` is UNKNOWN with no sources, and `source_excerpt` returns `INTEGRITY_FAILED` (`witnessed: false`, no sources). A rebound or replayed reference is not presented as current evidence, even when the file bytes are genuine. There is no archived or stale-source mode; adding one would need explicit, labeled semantics.
- **Source-linked.** Every claim in a result summary carries reference ids, and the result includes the verified excerpts.

`TOOL_DEFINITIONS` are provider-neutral JSON-schema tool specs, ready to hand to a model once one is configured. Running these tools deterministically is **not** evidence of LLM agent behavior; a real model run (model id, cost, tool path) must be recorded separately before that claim is made.
