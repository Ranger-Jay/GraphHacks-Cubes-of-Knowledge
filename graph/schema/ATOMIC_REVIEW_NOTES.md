# Atomic split: review notes

Non-blocking history observations on `claude/graph-atomic-v004` at `74d9ca0e9375bc59f2d49c0deaf12ded7556f5e4`
(v004.038-.051 on top of v004.031). Source: the independent review on PR #6,
https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/pull/6#issuecomment-6184376369. The published history is
not rewritten, and these exceptions are recorded, not eliminated. The final tree is unchanged by this note.

| Observation | Where | Disposition |
| --- | --- | --- |
| One test covers two concerns | v004.044 (`f1b44b7`): an edited evidence copy stays revoked (v004.040) and the intent names the overrides (v004.043) | Kept as one regression. Splitting it would change the final tree's test content. |
| Some tests follow the implementation they prove | v004.040 (`d3bc18a`), v004.043 (`0dab87d`) and v004.046 (`15b40ff`) land before their proving tests | The v004.046 CLI flag had no automated test; v004.053 adds one. The other two are proved by v004.041 and v004.044. |
| Help text changed under a docs label | v004.049 (`57b231e`) quotes the pipe-delimited `--reinstate` argument in the CLI usage string as well as both READMEs | One quoting defect, one commit. The final tree already carries the quoted usage text. |

Related follow-ups on `claude/graph-p3-v004`: v004.052 removes a stale duplicate doc comment above `bindingKey`, and
v004.053 tests the seed CLI `--reinstate` path end to end.
