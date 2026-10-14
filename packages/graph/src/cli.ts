// Operator CLI for the graph lane: health | seed | analyze <releaseId> [tenantId].
// Run from the repository root: node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts <command>
import { analyzeRelease, configFromEnv, graphHealth, GraphClient, seedGraph } from './index.js';

const [command, arg1, arg2] = process.argv.slice(2);
const client = new GraphClient(configFromEnv());
try {
  if (command === 'health') {
    const h = await graphHealth(client);
    console.log(JSON.stringify({ graph: client.config.graphName, ...h }));
    process.exitCode = h.ok ? 0 : 1;
  } else if (command === 'seed') {
    console.log(JSON.stringify(await seedGraph(client, process.cwd())));
  } else if (command === 'analyze' && arg1) {
    const result = await analyzeRelease(client, arg2 ?? 't-wad', arg1);
    console.log(JSON.stringify(result ?? { status: 'NOT_FOUND', releaseId: arg1 }, null, 2));
    process.exitCode = result?.status === 'AVAILABLE' ? 0 : 1;
  } else {
    console.error('usage: cli.ts health | seed | analyze <releaseId> [tenantId]');
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
