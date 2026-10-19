import { readFile, writeFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { evidenceKeyFromEnv, ledgerFromEnv, readChain } from '@cubes/graph';

// Run locally with node --env-file=.env. Values are written only to a gitignored file, never stdout.
const env = process.env;
const cfg = ledgerFromEnv(evidenceKeyFromEnv(env));
const graph = env.FALKORDB_GRAPH;
const tenant = env.API_TENANT_ID;
if (!cfg || !graph || !tenant) throw new Error('The existing private graph/witness settings are required');
if ((await readChain(cfg, graph, tenant)).status !== 'COMMITTED') throw new Error('Only an already committed, verified witness can be transferred');
const bytes = await readFile(join(cfg.dir, graph, `${tenant}.jsonl`));
if (bytes.length === 0 || bytes.length > 18000) throw new Error('Witness snapshot exceeds this bounded deployment format');
const values = {};
for (const key of ['FALKORDB_HOST', 'FALKORDB_PORT', 'FALKORDB_GRAPH', 'FALKORDB_USERNAME', 'FALKORDB_PASSWORD', 'FALKORDB_TLS', 'FALKORDB_TIMEOUT_MS', 'API_TENANT_ID', 'GRAPH_EVIDENCE_KEY']) {
  if (env[key] !== undefined) values[key] = env[key];
}
values.GRAPH_WITNESS_SNAPSHOT_B64 = bytes.toString('base64');
values.PUBLIC_DEMO_TALK_ENABLED = 'false';
if (process.argv.includes('--enable-talk')) {
  const index = process.argv.indexOf('--origin');
  const origin = index >= 0 ? process.argv[index + 1] : undefined;
  const parsed = new URL(origin ?? '');
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password) throw new Error('Supply the exact public HTTPS origin');
  for (const key of ['LLM_ENABLED', 'LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']) {
    if (!env[key]) throw new Error(`Missing ${key}; no values printed`);
    values[key] = env[key];
  }
  values.WEB_ORIGIN = origin;
  values.PUBLIC_DEMO_TALK_ENABLED = 'true';
}
const destination = resolve('.env.vercel');
await writeFile(destination, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
await chmod(destination, 0o600);
console.log('Private .env.vercel created for direct import in Vercel. Do not post, commit, or share its contents.');
console.log(`Configuration entries: ${Object.keys(values).length}. Existing graph and witness were read only.`);
