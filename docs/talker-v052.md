# Graph-grounded text explanations — v052

This is an author implementation, pending independent review and a real provider run.
Its parent is the tree of accepted PR #60, remote
`adacbe736f886c234f4a9ad60383d7d2f8c25578`. It does not include the separate v049
client access repair. No key has been supplied in this author environment, and no
live model call is claimed. Default setup makes zero provider calls.

## User-visible behavior

While the shell has a current READY analysis, a separate **Explain this release**
panel lets the user choose Roy, Ava or Guz's writing style and request a text
explanation of current music-clearance evidence. No request runs on mount. This is
the narrow `release-gap` intent, not a general question box, autonomous tool loop,
agent memory system or dynamic voice generator. Existing WAV voice previews and
outage/recovery clips remain separate.

The graph analysis above the explanation is authoritative. Generated prose is
explicitly labeled AI explanation with a reminder to inspect the cited evidence.
Citation membership and response scope are checked; that does not prove every
generated sentence true. The model cannot change graph clearance, permissions,
approvals or membership. It has no graph credentials, raw query or mutation tool.

The panel is unmounted whenever current READY analysis disappears, including a
refresh, outage or route departure, and keyed to the request generation and graph
revision. Cleanup cancels its pending request. Even a fetch ignoring cancellation
cannot supply a result through the canceled transport. The browser requires exact
response scope, revision, cut, clearance, persona, citation IDs and usage shape.

## Minimal local setup

Use the existing local graph/API/Vite setup and a server reader session. Do not
use `vite preview`: it has no authenticated development proxy. Do not seed or
change a shared/hosted graph for this feature. It only reads graph evidence.

In the root, gitignored, server-only `.env`, fill these settings locally:

```dotenv
LLM_ENABLED=true
LLM_PROVIDER=openrouter
LLM_MODEL=mistralai/mistral-nemo
LLM_API_KEY=YOUR_LOCAL_OPENROUTER_KEY
```

The last line is a placeholder. Do not paste the key into chat, issues, source,
shell history, screenshots or browser code. No `VITE_` variable is used. The API
process reads these values; the Vite process loads only its existing `API_` values.
Restart `npm run dev:api` after changing configuration.

Use a dedicated OpenRouter inference key with a **non-resetting limit of at most
$1 total**, **include BYOK usage in the limit**, and at least $0.01 remaining. A
resetting/unlimited/malformed key response is refused before a completion call.
The API verifies `/api/v1/key` on every attempt. These provider-enforced limits
survive local process restarts; the local concurrency gate is not a durable budget.
Key cap verification may succeed while a selected model endpoint is unavailable;
that is an unavailable result, never a fabricated answer. No new top-up is required
by the implementation.

`mistralai/mistral-nemo` is an initial low-cost text-model candidate, not a promise
of perpetual availability or quality. On 2026-10-18 the official model catalog
advertised structured output support and prices starting near $0.029/M input and
$0.030/M output. Provider prices/availability vary. Requests enforce price ceilings
of $0.10/M input and $0.50/M output plus no per-request surcharge; if no compatible
endpoint exists, the call fails. No automatic model switch or application retry is
implemented. A configured model must return the same model ID in its response.

## Server contract

`POST /api/talk`, JSON body with exactly:

```json
{"persona":"roy","intent":"release-gap","releaseId":"rel-wad"}
```

Persona accepts `roy`, `ava`, `guz`; it changes style only. Session identity comes
from the existing bearer slot. Only Kanny/owner or Serena/reader may request an
explanation. Roy's agent token remains refused; choosing persona Roy cannot grant
access. No caller role, tenant, phase, evidence, system prompt, model or query is
accepted. Route queries/trailing variants are not accepted. Cross-site requests,
nonmatching supplied Origin and non-JSON request bodies are refused. The allowed
browser origin is `WEB_ORIGIN`, default `http://127.0.0.1:5173`.

After authentication and validation:

1. Missing/disabled provider -> 503 NOT_IMPLEMENTED, no provider call.
2. Read the release through the existing tenant-scoped named graph analysis.
   Missing release -> 404; unavailable -> 503, no provider call.
3. At most one provider attempt runs at once, with a three-second cooldown and
   25-second combined provider timeout. Context <= 24 KB; completion <= 320 tokens;
   provider response <= 64 KB; no redirects, streaming or automatic retries.
4. Verify provider key cap, then send the authorized synthetic evidence context.
   Ask for strict JSON schema with explanation and existing citation IDs. Provider
   is price-sorted with fallback disabled and required parameters enforced.
5. Validate completion status, selected model, IDs, usage and citation membership.
   Unknown or duplicate citations, truncated output and unexpected payload fields
   are refused. Provider error bodies are never reflected or logged.
6. Read the graph analysis again. Unavailable -> discard text / 503. Changed
   revision or evidence context, even at the same revision -> discard / 409.
7. Return 200 AVAILABLE with graph scope/clearance, explanation, cited source IDs,
   actual provider request ID, actual model ID and token counts.

The second graph read is a freshness check, not an atomic guarantee that the world
cannot change after the response. UI refresh/generation controls remain required.
There is no success response on graph outage, no mutation and no new authority.
Provider failures use 503 NOT_IMPLEMENTED with bounded diagnostics: fixed
configuration/busy messages or an allowlisted AbortError, TimeoutError, TypeError,
SyntaxError or UnknownError label. Arbitrary error names, messages, causes, stacks
and provider bodies are not reflected or logged. The browser panel continues to
show a generic unavailable message; detailed safe diagnostics are in the HTTP
response and function logs, not the panel.

In the v061 hosting adapter, the function awaits the API handler's actual promise.
A response `close` notification neither aborts the model nor finishes the hosted
invocation. The hosted request has a **27-second total deadline**, beginning before
runtime initialization and including both graph reads and the provider call. It
can therefore shorten the provider's own 25-second budget when setup/reads take
longer. The browser waits **28 seconds**; Vercel's configured function limit is
**30 seconds**. These are application budgets, not a latency guarantee. A browser
cancel still suppresses late answers; server work may continue until its bounded
deadline. No automatic retries are introduced.

See [the v061 review and verification scope](verification/talk-v061-review.md).

## Validation and acceptance

Author commands:

```sh
npm ci
npm run verify
npx tsc -p tests/web/tsconfig.json --noEmit
git diff --check
```

Offline tests `tests/api/talker-v052.test.mjs` and
`tests/web/talk-v052.test.tsx` use explicit graph/provider fixtures. They test
refusal, budget guards, invalid citations/usage, request cancellation, evidence
changes and scope binding. SSR tests do not establish React effects or browser
behavior. Existing real graph tests must remain green. No new dependencies or
root version/lock changes are made by this slice.

Independent exact-head review must also run the actual panel through Vite/API and
real graph, verify a real OpenRouter completion on the configured model, and record
provider request ID plus usage without keys. Exercise reader/owner success, agent/
anonymous denial, graph unavailable with no new completion, provider refusal,
route/refresh cancellation and graph changes during an in-flight answer. Confirm
an unconfigured setup shows unavailable and no provider key reaches the build.
Use one small authorized inference first; do not run unbounded paid sweeps.

Only after that proof should a model explanation enter the video. The approved
default narrator script does not depend on it. Full art, IdeaVerse setup, durable
memory, Cloud connectivity, deployment, merge and release remain separate gates.

## Official references checked during implementation

- [Chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)
- [Current key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
- [Provider routing and max price](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Model catalog](https://openrouter.ai/api/v1/models)
