# Shutdown-race repair (v044.00–v044.02)

Branch: `boons/shutdown-race-v044`, parent `1e6a33cabd6cbee45bf35212c8cc43c42ea9d379`
(accepted transport #57). Scope: `tests/api/ideaverse.test.mjs` lifecycle helpers only.

## The race

`tests/api/ideaverse.test.mjs:131` asserts the outage status after `graph.stop()`:

```js
await graph.stop();
const down = await post(origin, '/api/studio/ideas/idea-c/import', owner, { ... });
assert.equal(down.status, 503);
```

CI (`graph-live`) observed `200 !== 503` there. Cause: `graph.stop()` waited
only for the python launcher process to exit. The launcher exits after sending
SIGTERM to the disposable FalkorDB server — not after the server has stopped.
Between the signal and the server closing its listener, a request could still
reach a live graph and succeed, so the outage assertion read 200.

## The fix (v044.00)

`stop()` now calls `waitUntilClosed(port)` after the launcher exits: it polls
the owned loopback port until a TCP connect is refused (`ECONNREFUSED`),
bounded at 10 s, polling every 50 ms. On timeout it throws instead of
proceeding, so a server that never stops fails loudly rather than flaking the
outage assertion.

Deliberate divergences from the sibling helper in `tests/api/startup-read.test.mjs`
(which already waits for port-close):

- Only `ECONNREFUSED` counts as closed; any other probe error retries. A
  transient error must not masquerade as a stopped server.
- A timeout throws. The sibling resolves silently on timeout; here the very
  next assertion requires the server to be stopped, so proceeding would
  reintroduce the flake.
- The launcher itself is unchanged (the sibling launcher additionally waits
  for pid death, then SIGKILLs). Port-close is the exact precondition of the
  outage assertion, and the change stays minimal.

Unchanged: the 503 outage assertion, the 8 s launcher kill fallback, cleanup,
no stubbed graph, no loosened status, no arbitrary sleep, no unrelated
process touched. The probe targets only the owned disposable server's
`127.0.0.1:<allocated-port>`.

## Regression evidence (v044.01)

- `waitUntilClosed waits for a listening port to close and throws while it
  stays open`: deterministic, against a dummy loopback server.
- `graph.stop() returns only after the disposable server port is closed`:
  contract test on the real disposable graph. It is flaky-before (passes on
  idle hardware, fails when the shutdown window opens under load) and
  deterministic-after.

## Reproduction

Before (parent `1e6a33ca`, local, idle hardware):

- Real test file, 9 runs: 9/9 pass — the race window is load-dependent and
  did not open here.
- Standalone probe using the pre-fix `stop()` logic verbatim (20 rounds,
  unloaded and CPU-loaded): port still accepting immediately after `stop()`
  returned in 0/20 rounds. The listener closes fast on idle hardware; the
  window opens under CI load.

After (this branch): full file 6/6 pass, repeated 4/4 runs. The fix converts
"assume stopped because signalled" into "verify stopped before asserting".

## Limits

- The CI failure itself was not reproduced locally on idle hardware; the
  before-state evidence is the mechanism (launcher-exit ≠ server-stopped)
  plus the CI observation `200 !== 503`.
- No live Cloud involvement: the disposable graph is local-only. Cloud
  Cypher parity and app-to-Cloud connectivity remain separately unproven.
- `scripts/ci-graph-tests.py` was not changed; it launches its own vendor
  server and does not share code with this test's inline launcher.
- Review: Claude independently reviews this repair; no self-acceptance.
