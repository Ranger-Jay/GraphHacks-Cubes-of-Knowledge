# Renderer and access endpoint composition — v050

This candidate combines the reviewed mounted shell, renderer increment and effective
access endpoint. It does not consume that endpoint in the browser yet: Add remains
disabled. The separate client binding requires its own review and later composition.

## Inputs and history

| Input | Exact pin | Composition |
| --- | --- | --- |
| Accepted mounted v046 / PR #59 | `bc39d60f3b2dfc0c64f4dde8db2ab90956fbb893` | Parent, unchanged |
| Reviewed renderer v047 | `00f1d7a54770e06b75ae54c95fead3722c7cad60` | One source commit replayed |
| Reviewed access v048 | `27e3a97818527b6f698124554cd8bbec818a1162` | Five source commits replayed separately |
| Standalone art reference | `a3c51fd27e76483e28f189c5e8003ed27704fa78` | Reference only; full parity not established |

Both component bases are ancestors of v046; their commits were replayed onto v046,
not used as replacement repository snapshots. The inherited shutdown repair and
recorded WAV masters remain present. No dependency, root version or lockfile changes.
The only composition-authored changes are this manifest and a provenance correction
and clarification in the v047 design document. No new product code is added here.

The earlier full visual-reference SHA printed in that document was incorrect despite
sharing the same seven-character prefix. The table above is the verified full pin.

## Behavior and remaining limits

- The mounted shell retains current graph snapshots, guarded events, source jumps,
  IdeaVerse inspection, recorded audio and outage/recovery handling from v046.
- v047 adds decorative stars, corner meshes, corona rings, agent pyramid geometry
  and scoped styles. Decorative geometry is not graph evidence. Its independent
  technical GO does not establish full approved-art appearance parity.
- v048 serves authenticated `GET /api/session/access` and narrowly allows the same
  read through the opted-in loopback owner-rehearsal alias. The ordinary proxy stays
  reader-only, and the browser holds no credential.
- The controller still receives UNKNOWN access. Serving a capability does not itself
  enable Add or prove an import. Browser capability binding is deliberately absent.

Carry the nonblocking findings: shortcut-like agent labels without key bindings,
the card below the long pool list, small-screen clipping, decorative ruby/data color
ambiguity, and lights with no effect on MeshBasicMaterial surfaces. These findings
are not hidden by a component GO.

## Verification

```sh
npm ci
npm run verify
npx tsc -p tests/web/tsconfig.json --noEmit
git diff --check
```

Author bootstrap checks on this composition pass: 247 tests, 244 pass, zero failures,
three explicit local launcher skips; check/build, web-test typecheck and diff check
pass. The host still denies AF_UNIX creation used by the redislite startup launcher.
Do not count those skips as startup/outage/reconnect proof. The separate real TCP
vendor-server graph command is `python3 scripts/ci-graph-tests.py` under the pinned
FalkorDBLite environment; its result is recorded in the publication packet.

Independent reviews of the inputs include v046's exact-head browser/graph evidence,
Cora's real API/proxy v048 check, and Claude's v047/v048 synthetic-composition rehearsal.
The rehearsal was not a published commit and does not transfer acceptance to this head.
Run the actual mounted shell, mandatory startup, graph, browser and access probes on
the exact published v050 SHA before issuing a verdict. Preserve v046 as the fallback.

Owner import/read-back/fade, complete comet lifecycle/labels, full art parity, model
execution, durable agent memory, application-to-Cloud connectivity, hosted engine
parity and deployment remain separate gates. No merge, hosted seed or release is implied.
