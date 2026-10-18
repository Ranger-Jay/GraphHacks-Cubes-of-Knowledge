// Real operator-process proof against a disposable graph; never a shared or hosted database.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeRelease, configFromEnv, evidenceKeyFromEnv, evidenceState, GraphClient, ideaverseOverview, importIdea, importStatus, ledgerFromEnv, loadIdeaManifest, readChain, seedGraph } from '../../packages/graph/src/index.ts';

const repo = process.cwd();
const entry = resolve(repo, 'packages/graph/src/cli.ts');
const graphs: GraphClient[] = [];
const directories: string[] = [];
const prefix = `idea_cli_${randomBytes(4).toString('hex')}`;
const fresh = (label: string) => {
  const client = new GraphClient({ ...configFromEnv(), graphName: `${prefix}_${label}` });
  graphs.push(client);
  return client;
};
const temporary = async () => { const path = await mkdtemp(join(tmpdir(), 'idea-cli-')); directories.push(path); return path; };
const cli = (client: GraphClient, args = ['seed-ideaverse'], options: { cwd?: string; signed?: boolean; port?: number } = {}) => {
  const env: NodeJS.ProcessEnv = { ...process.env, FALKORDB_GRAPH: client.config.graphName, ...(options.port ? { FALKORDB_HOST: '127.0.0.1', FALKORDB_PORT: String(options.port), FALKORDB_TLS: 'false', FALKORDB_USERNAME: '', FALKORDB_PASSWORD: '' } : {}) };
  if (!options.signed) { delete env.GRAPH_EVIDENCE_KEY; delete env.GRAPH_WITNESS_DIR; }
  return new Promise<{ code: number; out: string; err: string }>((resolveResult, reject) => {
    execFile(process.execPath, ['--import', resolve(repo, 'node_modules/tsx/dist/loader.mjs'), entry, ...args], { cwd: options.cwd ?? repo, env, timeout: 15000 }, (error, out, err) => {
      if (error && typeof error.code !== 'number') { reject(error); return; }
      resolveResult({ code: error ? Number(error.code) : 0, out, err });
    });
  });
};
after(async () => {
  for (const client of graphs) { await client.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await client.close(); }
  for (const directory of directories) await rm(directory, { recursive: true, force: true });
});

test('CLI seeds the shipped 100-file manifest on a fresh graph without licensing credentials', async () => {
  const client = fresh('default');
  const result = await cli(client);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), { seedVersion: 'wad-ideaverse@1', tenantId: 't-wad', ideas: 100, workspaceRevision: 0, edges: 100 });
  const overview = await ideaverseOverview(client, repo, 't-wad');
  assert.equal(overview.status, 'AVAILABLE');
  if (overview.status !== 'AVAILABLE') return;
  assert.deepEqual([overview.counts, overview.workspace.revision, overview.integrity], [{ ideas: 100, imported: 0 }, 0, []]);
  const manifest = await loadIdeaManifest(repo);
  assert.deepEqual(overview.ideas.map(i => i.id).sort(), manifest.ideas.map(i => i.id).sort());
  assert.equal((await client.read<{ n: number }>('MATCH (i:IdeaFile)-[e:DEFINED_IN]->(s:StudioSource) WHERE s.path = $path AND s.sha256 = $sha RETURN count(e) AS n', { path: manifest.manifestPath, sha: manifest.manifestSha256 }))[0]?.n, 100);
  assert.equal((await client.read<{ n: number }>('MATCH (r:ImportReceipt) RETURN count(r) AS n'))[0]?.n, 0);
});

test('CLI tenant selection and repeat seed preserve imported membership, receipt and revision', async () => {
  const client = fresh('repeat');
  const tenantId = 't-cli-demo';
  assert.equal((await cli(client, ['seed-ideaverse', tenantId])).code, 0);
  const idea = (await loadIdeaManifest(repo)).ideas[0]!;
  const imported = await importIdea(client, repo, { tenantId, ideaId: idea.id, idempotencyKey: 'cli-import-0001', expectedRevision: 0 });
  assert.equal(imported.status, 'IMPORTED');
  const before = await ideaverseOverview(client, repo, tenantId);
  const repeated = await cli(client, ['seed-ideaverse', tenantId]);
  assert.equal(repeated.code, 0, repeated.err);
  assert.deepEqual(JSON.parse(repeated.out), { seedVersion: 'wad-ideaverse@1', tenantId, ideas: 100, workspaceRevision: 1, edges: 100 });
  assert.deepEqual(await ideaverseOverview(client, repo, tenantId), before);
  if (imported.status === 'IMPORTED') assert.deepEqual(await importStatus(client, tenantId, 'cli-import-0001'), { status: 'IMPORTED', receipt: imported.receipt });
  assert.equal((await client.read<{ n: number }>('MATCH (i:IdeaFile {tenantId: $tenantId}) RETURN count(i) AS n', { tenantId: 't-wad' }))[0]?.n, 0);
  assert.equal((await client.read<{ n: number }>('MATCH (r:ImportReceipt) RETURN count(r) AS n'))[0]?.n, 1);
});

test('CLI idea seed leaves licensing evidence, witness chain and current-cut GAP unchanged', async () => {
  const client = fresh('witness');
  process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-cli-evidence-key-0123456789abcdef';
  process.env['GRAPH_WITNESS_DIR'] = await temporary();
  await seedGraph(client, repo, { initWitness: true });
  const ledger = ledgerFromEnv(evidenceKeyFromEnv());
  assert.ok(ledger);
  const before = { state: await evidenceState(client, 't-wad'), chain: await readChain(ledger, client.config.graphName, 't-wad') };
  const result = await cli(client, ['seed-ideaverse'], { signed: true });
  assert.equal(result.code, 0, result.err);
  assert.deepEqual({ state: await evidenceState(client, 't-wad'), chain: await readChain(ledger, client.config.graphName, 't-wad') }, before);
  const analysis = await analyzeRelease(client, 't-wad', 'rel-wad');
  assert.ok(analysis?.status === 'AVAILABLE' && analysis.clearance === 'GAP' && analysis.revision === 'rel-wad@r1');
});

test('CLI refuses a tampered shipped manifest before any seed write', async () => {
  const client = fresh('invalid');
  await client.write('CREATE (:CliSentinel {id: $id})', { id: 'untouched' });
  const root = await temporary();
  const manifest = await loadIdeaManifest(repo);
  const first = manifest.ideas[0]!;
  await mkdir(join(root, 'graph/seed/ideaverse/files'), { recursive: true });
  await writeFile(join(root, manifest.manifestPath), await readFile(join(repo, manifest.manifestPath)));
  const bytes = await readFile(join(repo, first.path));
  bytes[0] = bytes[0] === 65 ? 66 : 65;
  await writeFile(join(root, first.path), bytes);
  const result = await cli(client, ['seed-ideaverse'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.out, '');
  assert.match(result.err, /hash differs from the file/);
  assert.equal((await client.read<{ n: number }>('MATCH (n) RETURN count(n) AS n'))[0]?.n, 1);
});

test('CLI rejects unsupported flags/extra arguments and graph outage never reports seed success', async () => {
  const client = fresh('errors');
  for (const args of [['seed-ideaverse', '--init-witness'], ['seed-ideaverse', 't-wad', '--resume'], ['seed-ideaverse', 't-wad', 'extra']]) {
    const result = await cli(client, args, { port: 1 });
    assert.equal(result.code, 2, result.err);
    assert.equal(result.out, '');
    assert.match(result.err, /seed-ideaverse \[tenantId\]/);
  }
  const result = await cli(client, ['seed-ideaverse'], { port: 1 });
  assert.equal(result.code, 1);
  assert.equal(result.out, '');
  assert.match(result.err, /Graph connection failed|Graph connection timed out/);
});
