// Operator CLI for the graph lane: health | seed-ideaverse [tenantId] | seed-studio [tenantId] | studio-overview [tenantId] | seed-agent-profiles [tenantId] | agent-profiles [tenantId] | seed [--init-witness] [--resume] [bundle...] | witness-recover | analyze <releaseId> [tenantId].
// Run from the repository root: node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts <command>
import { analyzeRelease, configFromEnv, evidenceKeyFromEnv, graphHealth, GraphClient, ledgerFromEnv, recoverWitness, revokeEvidence, seedGraph, seedIdeaverse, seedStudio, studioOverview, seedAgentProfiles, agentProfileOverview } from './index.js';

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
    console.log(JSON.stringify(await seedGraph(client, process.cwd(), { bundles, initWitness: rest.includes('--init-witness'), resumeWitness: rest.includes('--resume'), allowRevisionRollback: rest.includes('--allow-revision-rollback'), reinstate: rest.filter(a => a.startsWith('--reinstate=')).map(a => a.slice('--reinstate='.length)) })));
  } else if (command === 'seed-ideaverse' && (!arg1 || !arg1.startsWith('--')) && !arg2) {
    // Verified repository manifest only; studio proposals do not initialize or modify the licensing witness.
    console.log(JSON.stringify(await seedIdeaverse(client, process.cwd(), arg1 ? { tenantId: arg1 } : {})));
  } else if (command === 'seed-studio') {
    // Studio crew and departments: separate from the licensing seed and its witness. arg1 = tenantId (default t-wad).
    console.log(JSON.stringify(await seedStudio(client, process.cwd(), arg1 ? { tenantId: arg1 } : {})));
  } else if (command === 'studio-overview') {
    const o = await studioOverview(client, process.cwd(), arg1 ?? 't-wad');
    console.log(JSON.stringify(o.status === 'AVAILABLE' ? { ...o, nodes: o.nodes.length, edges: o.edges.length } : o));
    process.exitCode = o.status === 'AVAILABLE' && o.integrity.length === 0 ? 0 : 1;
  } else if (command === 'seed-agent-profiles') {
    // Agent profiles, voices, resources, roles and DISPLAY-ONLY role assignments. Never creates a Principal. arg1 = tenantId (default t-wad).
    console.log(JSON.stringify(await seedAgentProfiles(client, process.cwd(), arg1 ? { tenantId: arg1 } : {})));
  } else if (command === 'agent-profiles') {
    const o = await agentProfileOverview(client, process.cwd(), arg1 ?? 't-wad');
    console.log(JSON.stringify(o.status === 'AVAILABLE' ? { status: o.status, enforcement: o.enforcement, profiles: o.profiles.map(p => ({ agent: p.agentId, name: p.name, access: p.access.state === 'ASSIGNED' ? `${p.access.role.name} (intended, not enforced)` : p.access.state, skills: p.resources.skills.status, memory: p.resources.memory.status })), integrity: o.integrity } : o));
    process.exitCode = o.status === 'AVAILABLE' && o.integrity.length === 0 ? 0 : 1;
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
    console.error('usage: cli.ts health | seed-ideaverse [tenantId] | seed-studio [tenantId] | studio-overview [tenantId] | seed-agent-profiles [tenantId] | agent-profiles [tenantId] | seed [--init-witness] [--resume] [--allow-revision-rollback] [\'--reinstate=<kind|subject|path>\'] [bundle...] | revoke <licenseId> <newRevision> [releaseId] | witness-recover [tenantId] [--repair-torn-tail] | analyze <releaseId> [tenantId]');
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
