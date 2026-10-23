# Hosted Explain review — v061

## Decision and scope

**NO-GO on `6a17821b8d84af159fdd754544621f9331ee2107` alone.**
Its parent is `3b6c00a0229d42abec6b80d561938951473a19b0`; the diff is exactly
`apps/api/src/app.ts` and `apps/api/src/talker.ts`, +17/−8, as reported.

The reported early-close condition is plausible, but its occurrence in production
has not been independently established here. The following offline regressions
fail on that exact head and pass with the follow-up fixes:

| Finding | Reproduction and repair |
| --- | --- |
| Hosted lifecycle remains vulnerable to early `close` | Hold a provider fixture, emit response `close`, observe `createPublicHandler` resolve before the API finishes. The adapter now awaits `createApiHandler` directly; Node's `createApiServer` wraps that same handler. |
| Error labels are not inherently safe | A thrown Error with a private fixture string in `.name` reaches the API response and log. The talker now maps names to fixed allowlisted labels; unknown values become `UnknownError`. |
| Browser deadline cuts off valid slow answers | A valid current response at 21 seconds is discarded by the old 20-second timer. The repaired client accepts a response at 26 seconds and still discards late responses after 28 seconds. |

Removing the response-close abort permits bounded provider work after a genuine
client disconnect; it is no longer a cancellation signal. There are no other
callers relying on that local controller. Provider timeout, key cap, process-local
busy guard and cooldown remain. The busy guard is not cross-instance admission
control; the provider-enforced capped key remains the shared spending boundary.

## Candidate

Branch: `buddy/talk-review-v061`, based directly on the proposed fix.
v061.006–.011 separately commit diagnostic repair/tests, hosted lifecycle repair/tests
and browser deadline repair/tests. v061.012 adds explicit hosted regression checks
to CI; v061.013 records this review and updates the timeout documentation.

Budget: **provider 25s ≤ total hosted request 27s < browser 28s < platform 30s**.
The total deadline begins before runtime initialization. Slow initialization or
graph reads reduce time available to the provider. Timeout returns a static 503,
aborts provider work and prevents late initialization/read/completion results from
making another response. Graph freshness is still rechecked after a completion.

Independent code review: **GO at local review head
`8335a6d7d04f1d02fc5eccbbd746878c10e2dca4`**. The reviewer independently ran
27/27 API/hosting and 9/9 web transport/mounted-lifecycle checks. That GO covers
code, not cloud acceptance or release authority. Its CI-coverage P3 is addressed
by v061.012; subsequent configuration/documentation deltas need final readback.

Git transport could not authenticate, so publication uses the GitHub connector.
The published v061.011 commit is
`0a11420b37fed409a2507442d416f290a3113d38`; its complete Git tree
`e6c6142094f8d56fb018e5171b0528f6f9e90bf6` matches the reviewed local head exactly.
Commit identities differ because the connector supplies commit metadata; each
separate change and its original parent order are preserved.

## Validation

- `npm ci --ignore-scripts`: dependency installation succeeded.
- `npm run verify`: typecheck, 41 offline files / 304 passed, 3 skipped, and full build.
- `node --test tests/api/*.test.mjs`: 37 passed, 3 live-graph startup cases skipped.
- `node --test tests/runtime/vercel-public-v061.test.mjs`: 15 passed, including
  early close and deadline expiry during initialization, first read, provider and
  freshness read; late work produces no second response.
- `npx tsc -p tests/web/tsconfig.json --noEmit` and `git diff --check`: passed.

All new network/provider/graph inputs are explicitly offline fixtures. No live
OpenRouter call, FalkorDB mutation, production change or hosted-browser success is
claimed. Existing build warnings remain outside this repair.

## Hosted acceptance before promotion

Preview authentication does not establish that production is the only possible
test target. Use the deployment owner's authenticated Vercel CLI or origin-scoped
automation headers on the exact preview. Preserve Deployment Protection and the
application's origin/session checks; do not ship bypass credentials or weaken the
browser's `credentials: 'omit'` policy.

After an authorized capped test, record the exact deployment/commit, HTTP result,
function-log outcome, actual model/request ID/usage and current graph scope. A
successful graph read alone does not prove Explain. The UI still uses its generic
failure panel; detailed safe diagnostics require the HTTP response/function log.
Restore any temporary Preview origin configuration through its owner.

Only Jay's explicit release approval may advance the production branch. No such
advance is part of this review. Current production success and the precise cause
of its original failure remain **UNKNOWN**.
