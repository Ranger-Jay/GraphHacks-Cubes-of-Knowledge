// Operator CLI for the graph lane: health | seed [--init-witness] [--resume] [bundle...] | witness-recover | analyze <releaseId> [tenantId].
// Run from the repository root: node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts <command>
import { analyzeRelease, configFromEnv, evidenceKeyFromEnv, graphHealth, GraphClient, ledgerFromEnv, recoverWitness, seedGraph } from './index.js';

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
    console.log(JSON.stringify(await seedGraph(client, process.cwd(), { bundles, initWitness: rest.includes('--init-witness'), resumeWitness: rest.includes('--resume') })));
  } else if (command === 'witness-recover') {
    const cfg = ledgerFromEnv(evidenceKeyFromEnv());
    if (!cfg) throw new Error('GRAPH_WITNESS_DIR and GRAPH_EVIDENCE_KEY are required');
    console.log(JSON.stringify({ result: await recoverWitness(client, cfg, arg1 ?? 't-wad') }));
  } else if (command === 'analyze' && arg1) {
    const result = await analyzeRelease(client, arg2 ?? 't-wad', arg1);
    console.log(JSON.stringify(result ?? { status: 'NOT_FOUND', releaseId: arg1 }, null, 2));
    process.exitCode = result?.status === 'AVAILABLE' ? 0 : 1;
  } else {
    console.error('usage: cli.ts health | seed [--init-witness] [--resume] [bundle...] | witness-recover [tenantId] | analyze <releaseId> [tenantId]');
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
