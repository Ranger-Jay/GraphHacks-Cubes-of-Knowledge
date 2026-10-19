import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readChain } from '@cubes/graph';

const segment = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value) && !value.includes('..');

/**
 * The encrypted deployment environment holds the authoritative, fixed witness bytes.
 * /tmp is only a disposable read cache. Never derive or initialize a witness from graph state.
 */
export async function prepareWitnessSnapshot(env) {
  const graph = env.FALKORDB_GRAPH;
  const tenant = env.API_TENANT_ID;
  const raw = env.GRAPH_WITNESS_SNAPSHOT_B64;
  if (!segment(graph) || !segment(tenant) || typeof env.GRAPH_EVIDENCE_KEY !== 'string' || env.GRAPH_EVIDENCE_KEY.length < 32
    || typeof raw !== 'string' || raw.length === 0 || raw.length > 24000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error('A bounded private witness snapshot and matching graph configuration are required');
  }
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.toString('base64') !== raw) throw new Error('Invalid witness encoding');
  const dir = await mkdtemp(join(tmpdir(), 'cubes-reader-witness-'));
  try {
    await mkdir(join(dir, graph), { mode: 0o700 });
    await writeFile(join(dir, graph, `${tenant}.jsonl`), bytes, { mode: 0o600, flag: 'wx' });
    const config = { dir, key: Buffer.from(env.GRAPH_EVIDENCE_KEY, 'utf8') };
    if ((await readChain(config, graph, tenant)).status !== 'COMMITTED') throw new Error('Witness snapshot is not committed and valid');
    return config;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
