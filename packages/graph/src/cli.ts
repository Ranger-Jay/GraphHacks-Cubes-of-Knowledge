// Operator CLI for the graph lane: health | seed [--init-witness] [--resume] [bundle...] | witness-recover | analyze <releaseId> [tenantId].
// Run from the repository root: node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts <command>
import { analyzeRelease, configFromEnv, evidenceKeyFromEnv, graphHealth, GraphClient, ledgerFromEnv, recoverWitness, revokeEvidence, seedGraph } from './index.js';

const [command, arg1, arg2] = process.argv.slice(2);
const rest = process.argv.slice(3);
const client = new GraphClient(configFromEnv());
try {
  if (command === 'health') {
    const h = await graphHealth(client);
    console.log(JSON.stringify({ graph: client.config.graphName, ...h }));
    process.exitCode = h.ok ? 0 : 1;
  } else if (command === 'seed') {
    const bundles = rest.filter(a => !a.startsWith('--'));
    console.log(JSON.stringify(await seedGraph(client, process.cwd(), { bundles, initWitness: rest.includes('--init-witness'), resumeWitness: rest.includes('--resume'), allowRevisionRollback: rest.includes('--allow-revision-rollback') })));
  } else if (command === 'revoke' && arg1 && arg2) {
    // revoke <licenseId> <newRevision> [releaseId]
    console.log(JSON.stringify(await revokeEvidence(client, ledgerFromEnv(evidenceKeyFromEnv()), 't-wad', { licenseId: arg1, newRevision: arg2, releaseId: process.argv[5] ?? 'rel-wad' })));
  } else if (command === 'witness-recover') {
    const cfg = ledgerFromEnv(evidenceKeyFromEnv());
    if (!cfg) throw new Error('GRAPH_WITNESS_DIR and GRAPH_EVIDENCE_KEY are required');
    const tenant = arg1 && !arg1.startsWith('--') ? arg1 : 't-wad';
    console.log(JSON.stringify({ result: await recoverWitness(client, cfg, tenant, { repairTornTail: process.argv.includes('--repair-torn-tail') }) }));
  } else if (command === 'analyze' && arg1) {
    const result = await analyzeRelease(client, arg2 ?? 't-wad', arg1);
    console.log(JSON.stringify(result ?? { status: 'NOT_FOUND', releaseId: arg1 }, null, 2));
    process.exitCode = result?.status === 'AVAILABLE' ? 0 : 1;
  } else {
    console.error('usage: cli.ts health | seed [--init-witness] [--resume] [--allow-revision-rollback] [bundle...] | revoke <licenseId> <newRevision> [releaseId] | witness-recover [tenantId] [--repair-torn-tail] | analyze <releaseId> [tenantId]');
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
