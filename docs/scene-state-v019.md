# Scene presentation state v019

This is a type-only preparation branch based on frozen integration head d8c9938ff82b957ddbdeaf09f799c92ff168e6ec. It adds ScenePhase and SceneRuntimeContext; it does not implement new behavior or accept any visual candidate.

Evidence transport SceneData stays unchanged. SceneRuntimeContext must be derived by the web/integration layer from actual current request results and passed through the scene boundary as a **runtime** prop. Component implementations may fail closed to CHECKING when absent; absence must not imply a database outage or permission to speak. The completed integrated application must supply the context.

| Phase | Meaning | Presentation / behavior |
| --- | --- | --- |
| CHECKING | No completed current result/probe pair | Waiting; no substantive answers, proof or task-start acknowledgments |
| READY | Real graph probe AVAILABLE and fresh authorized AVAILABLE analysis from the active request generation | Healthy composition and current returned proof; only implemented authorized operations remain eligible |
| GRAPH_UNAVAILABLE | Current graph probe/read actually proves graph connection/query failure | Damaged cube, dying grey-black core, empty proof and fixed approved outage notice only |
| ACCESS_DENIED | Analysis denied (401/403) while graph is not proven down | Access-denied notice, no current proof; do not claim DB disconnected |
| NOT_FOUND | Authorized request completed with missing release | Missing-information notice, no current proof; do not claim DB disconnected |
| UNAVAILABLE | API/network/invalid/unimplemented result prevents determining or loading current information | Information unavailable, no current proof; do not claim a confirmed DB outage without evidence |

Rules:

- Keep reachability, process liveness, analysis availability and permission separate. BOOTSTRAP ready=false is process metadata, not a graph outage signal.
- A current graph/read CONNECTION_FAILED or QUERY_FAILED takes the graph-dependent experience out of READY. API transport failure alone cannot establish the database's physical state.
- Source/analysis data passed to the scene is AVAILABLE only for the current READY generation; otherwise clear nodes, edges and selection. A stale completion cannot restore READY or repopulate proof after disconnection/new request.
- Within one refresh generation, wait for both the real graph probe and authorized analysis before declaring READY. An observed current graph failure keeps the generation blocked even if an older/mid-race success exists. A fresh generation is needed to establish recovery.
- Normal greetings/help/affirmative/negative/task-start speech is eligible only in READY. GRAPH_UNAVAILABLE permits only the fixed outage explanation/caption. Other blocked phases get their accurate status explanation, not false disconnected dialogue.
- Connection/probe success alone does not authorize a task, imply a music license, implement an approval/handoff writer or establish model execution.
- The application currently refreshes on load/re-query. Continuous monitoring is not implemented by this type addition. Any additional detector must use real bounded probes and be tested; an art toggle alone proves nothing.
- Keep muted captions, keyboard/text alternatives and reduced-motion behavior. Test access denial and real DB loss independently.
- Preserve the frozen baseline; consumer changes belong to separate revisions. Independent reviewers reproduce the final combined head, including state precedence, speech cancellation and stale completions.

No production, hosted seed, new endpoint, provider call, merge or deployment is introduced.
