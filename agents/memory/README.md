# Durable agent handoff (v010)

Implementation: `packages/graph/src/handoff.ts` (`saveHandoff`, `getHandoff`, `handoffInbox`). Tests: `tests/graph/handoff.test.ts`.

An agent (Roy, Ava or Guz) leaves a scoped note for another agent in the same tenant. It lives in FalkorDB:
`(:Principal)-[:LEFT_HANDOFF]->(:Handoff)-[:FOR_AGENT]->(:Principal)` and `(:Handoff)-[:ABOUT]->(:Release)`. So it survives reconnects, process restarts and fresh sessions.

| Rule | How |
| --- | --- |
| Identity | `fromAgentId` and `tenantId` come from the server context. A request field naming the sender is rejected. |
| Scope | Both agents must be `MEMBER_OF` the tenant as `AGENT`; self-handoffs are invalid. Only the sender and recipient can read a handoff. |
| Guarded write | One atomic query: written only if the release revision equals `expectedRevision`. The idempotency key is unique per tenant (`MERGE`). The same key and request replays (`REPLAYED`); the same key with a different request is `IDEMPOTENCY_CONFLICT`. Concurrent saves create exactly one record. |
| Approval | `approvedNextStep` is set only for a bounded read-only tool call, `tool:<name>:<id>`, from the agent tool catalog. Anything else is kept as `pendingNextStep`, and `approvedNextStep` is `NONE`. An agent cannot approve a human-gated action. |
| Evidence | Cited `sourceRefIds` must be verified excerpts in the tenant (file hash plus code-point offsets). |
| Integrity | Each record is HMAC-signed with the server evidence key (`GRAPH_EVIDENCE_KEY`). Recovery refuses tampered, forged or unsigned records. With no key, nothing is saved. |
| Staleness | Recovery reports `stale: true` when the release revision has moved since the handoff. |
| Outage | Save, read and inbox all return `UNAVAILABLE`; nothing is assumed. |

Contract note: `HandoffRequest` in contract v1 has no `releaseId`. The graph operation takes it explicitly, and the API lane derives or carries it (to be coordinated with Integration).
