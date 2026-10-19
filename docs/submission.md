# Submission and evidence reference

## Project description

Cubes of Knowledge turns a fictional film studio's connected evidence into an inspectable 3D company brain. FalkorDB connects releases, cuts, tracks, versioned licenses and source references. The current cut has a licensing GAP: Basement Hum covers Cut v3 only, while Night Drive covers Cut v4. The interface shows the graph result, lets the user inspect its source excerpt, and withholds current proof during real graph failure. An optional low-cost model explains the scoped evidence with checked citation ids. An owner can import a synthetic IdeaVerse file through a receipt plus server read-back.

**Primary track:** Company Brain. Persistent agent memory and cross-session agent handoff are not claimed.

## Candidate

Final reviewed code commit: **33cd3ae56428c283f6ce38ed17fefdc2b20ebada**.  
Branch: **buddy/approved-art-integration-v058**.  
Release review: [PR #66](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/pull/66).

The visual lane is frozen at this commit. Final packaging edits are documentation only and need a separate diff review; they do not establish a new runtime verdict. Human appearance/release approval, final video link and actual submission remain separate from technical review. Earlier evidence is retained below with its original scope. The independently accepted `e05e3c56e06e2bf2efdf97b275a8fdd677ebe9d2` remains a fallback.

## Independent review

| Evidence | Scope |
| --- | --- |
| [Claude final visual-candidate GO](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6257616404) | Exact 33cd3ae tree: 349 files; typecheck/build, 198/198 web tests, 63/63 scene tests; real Chromium with software WebGL. Motion/lifecycle 6/6, outage/recovery 10/10, agent cancellation/isolation 33/33. Orbit/drag 16/17: release outside the canvas leaves drag active until a click; nonblocking for filming with drags kept inside. No paid provider call. |
| [Claude combined GO](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6250501222) | 302/302 verification, 108/108 real-graph cases, 49/49 owner journey; code fd71b7b. |
| [Cora filming journey](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6250622141) | Real headless Chrome, source highlighting, graph stop/restart, owner/reader behavior, IdeaVerse and comparison cube. Three initial harness assertions were corrected by explicit follow-up checks in that report. |
| [Claude docs carry-forward](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6251808531) | b5b2f61 is README only over fd71b7b. |
| [Reported provider completion](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6251478323) | Nemo, HTTP 200, 1,424 tokens, six source refs, GAP at rel-wad@r1; entrant's host. |
| [Metadata consistency review](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6251485396) | Reported values match code and seed; no independent provider execution. |
| [Reported browser answer](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6251576102) | Correct Cut v4 GAP explanation. |
| [Answer review](https://github.com/Ranger-Jay/Hackathon-Tome-of-Knowledge/issues/2#issuecomment-6251619739) | Correct and suitable for filming; omission of Cut v3 detail does not contradict the evidence. |

Some automation uses explicitly labeled provider/read-aloud doubles. Live provider evidence above is separate. Review reports list their complete limits.

## Seven-shot recording journey

1. Show the Company Cube and real READY/GAP result.
2. Follow Cut v4 to the two tracks: Basement Hum STALE, Night Drive VERIFIED.
3. Open the cited source and its visible highlight; show the Cut v3-only excerpt.
4. Show the optional Explain answer if already configured. Label it as an AI explanation; avoid repeated calls.
5. Show a real graph stop/re-query and restart/re-query from the verified local setup. Distinguish this from the unconfigured comparison cube.
6. Inspect an IdeaVerse file. If filming owner import, show pending → verifying → Added after read-back; reader mode cannot add.
7. Focus the disconnected comparison cube and its exact unavailable copy, then return to the working main cube.

Concept stills may frame the opening/closing; label them as artwork. They are not application screenshots. Keep the original narration master and approved script.

## Hosting and reproduction

The verified web path is local Vite + Node API. The server retains graph/model credentials and the separate durable evidence witness. Owner rehearsal is deliberately loopback-only. Production hosting needs a reviewed session/proxy path and suitable witness persistence; a static Vite upload does not supply those capabilities.

The [official FAQ](https://www.wemakedevs.org/hackathons/falkordb) allows complete local instructions and a working demo video when deployment is unavailable. The [local setup reference](local-setup.md) is provided for that route. Do not describe an artwork page, a local API, or a disconnected static frontend as a working public deployment.

## Final human checklist

- Confirm the final artwork and recorded application match.
- Watch the exported video; check speech, readable sources, outage/recovery labels and the disclosed artwork.
- Supply a publicly accessible demo-video URL in the actual submission form.
- Confirm repository/branch or approved merged commit and local setup instructions.
- Confirm the actual form's required fields and submit before the event deadline. A prepared PR, export or draft is not a submitted entry.
- Human release approval remains required. No new purchase, deployment, database reset or license selection is implied by this document.
