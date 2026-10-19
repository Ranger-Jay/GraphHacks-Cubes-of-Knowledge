import { writeFile } from 'node:fs/promises';
import { QUERIES, readEvidenceSnapshot, ideaverseOverview, importStatus } from '@cubes/graph';
import { IMPORT_WRITE_QUERY } from '../packages/graph/dist/ideaverse.js';

// Capture query text from the shipped functions with an empty offline reader. No database is contacted.
async function capture(run) {
  let query;
  await run({ read: async text => { query = text; return []; } });
  if (typeof query !== 'string') throw new Error('Expected a shipped Cypher query');
  return query.trim();
}
const snapshot = await capture(client => readEvidenceSnapshot(client, 't-wad'));
const overview = await capture(client => ideaverseOverview(client, process.cwd(), 't-wad'));
const receipt = await capture(client => importStatus(client, 't-wad', 'query-docs-only'));
const code = query => `\n\n\`\`\`cypher\n${query.trim()}\n\`\`\`\n`;
let document = `# Cypher queries and graph algorithms

The product uses FalkorDB relationship traversal and deterministic evidence checks. The optional language model explains the resulting facts. It does not choose Cypher or determine clearance.

## Submission description

Cubes of Knowledge follows Release → CURRENT_CUT → Cut → USES_TRACK → Track. It follows License → COVERS → Track and License → VALID_FOR → Cut to check that each used track is licensed for the current edit. SourceRef → EXCERPT_OF → Source connects claims to immutable file excerpts. The API reads one tenant-scoped evidence snapshot from FalkorDB and verifies its state against a separate signed witness. It then checks file SHA-256 values, Unicode code-point excerpt offsets, signed evidence bindings, and the licensed cut version. Only complete, verified coverage can establish clearance. A v3 license does not clear v4. Graph failure withholds current proof. The optional explanation receives verified facts and citation IDs, then undergoes a fresh evidence check before display.

This is a deterministic traversal and validation algorithm. No PageRank, vector search, or model-written query is required.

## Current release analysis: one consistent snapshot

This is the actual query issued by readEvidenceSnapshot. All later clearance traversal uses these same returned nodes and edges in memory. Reading the licensing facts in separate queries would create a gap between checking evidence and using it.
` + code(snapshot);
document += `
The snapshot is hashed canonically. The hash and release revision must equal the committed witness. A missing, corrupt, pending, mismatched, or revoked evidence state cannot establish clearance.

## Named query catalog

These are the exact exported query strings. The current clearance implementation uses the single snapshot above and SnapshotView equivalents of the relationship traversals. The release query also supports the scoped existence check. The catalog is not a claim that every listed query runs separately on every page load.
`;
for (const [name, query] of Object.entries(QUERIES)) document += `\n### ${name}\n` + code(query);
document += `
## IdeaVerse overview

This read retrieves workspace revision, idea metadata, memberships, and receipts together. File bytes and hashes are checked against the repository manifest. Ambiguous IDs, duplicate receipts, missing memberships, or altered metadata are withheld.
` + code(overview);
document += `
## IdeaVerse receipt lookup

The server hashes the tenant-scoped idempotency key before this lookup. An existing receipt still needs independent membership and manifest read-back before the UI may show Added.
` + code(receipt);
document += `
## IdeaVerse atomic import: local owner rehearsal only

The API authenticates an owner before this statement can run. One serialized write checks unique identities, expected revision, verified file metadata, unused key, and absent membership. It then increments the workspace revision and creates the receipt and membership together. The API performs a fresh read-back afterward. The Vercel public reader denies this route.
` + code(IMPORT_WRITE_QUERY);
document += `
## Clearance evaluation steps

1. Select the tenant on the server. Accept only a supported release ID.
2. Read one real FalkorDB evidence snapshot.
3. Verify the separate signed witness, snapshot hash, and release revision.
4. Resolve the current cut and its complete cue-sheet track set.
5. Verify source hashes, exact excerpt offsets, and signed source bindings.
6. Match covering licenses to the same current cut. Re-derive scope from verified source text.
7. Return VERIFIED, STALE, or MISSING track evidence. Integrity or incomplete scope stays UNKNOWN.
8. Return ESTABLISHED only for complete verified coverage. Return GAP for complete coverage with stale or missing clearance.
9. On graph failure, return UNAVAILABLE and clear proof. Never substitute cached or decorative results.
10. If requested, send scoped facts to the text model. Check citation IDs and re-read current graph evidence before accepting its answer.

## Parameters and execution

Values such as $tenantId, $releaseId, $cutId, $ids, and import metadata are passed as parameters. Browser input never becomes Cypher text. Reads, including the HEALTH readiness query, use GRAPH.RO_QUERY. The readiness query requires at least one Release and does not seed a graph.

Source: packages/graph/src/queries.ts, state-ledger.ts, analysis.ts, snapshot-rows.ts, ideaverse.ts, and apps/api/src/ideaverse.ts.

This document prints operational read/import queries and the decision algorithm. Seed/schema writes and optional agent-profile fixture queries remain in their respective source modules. Query-text extraction is offline documentation generation; it is not evidence of a successful database run.

Regenerate after building with: node scripts/print-graph-queries.mjs
`;
await writeFile(new URL('../docs/graph-queries.md', import.meta.url), document);
console.log('Wrote docs/graph-queries.md from the shipped query functions and catalog. No database contacted.');
