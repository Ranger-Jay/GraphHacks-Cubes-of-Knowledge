import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FalkorDB } from 'falkordb';
import { analyzeRelease, configFromEnv, GraphClient, graphHealth } from '@cubes/graph';
import { createApiHandler } from '../apps/api/dist/app.js';
import { createGraphIdeaverse } from '../apps/api/dist/ideaverse.js';
import { talkerFromEnv } from '../apps/api/dist/talker.js';
import { prepareWitnessSnapshot } from './witness-snapshot.mjs';

const connectGraph = FalkorDB.connect.bind(FalkorDB);
FalkorDB.connect = async options => {
  const db = await connectGraph(options);
  const emit = db.emit.bind(db);
  db.emit = (event, ...args) => event === 'error' ? true : emit(event, ...args);
  return db;
};

/** Same graph/API implementations as local rehearsal; a server-derived public reader and no listening port. */
export async function createHostedRuntime(env = process.env) {
  if (!env.FALKORDB_HOST || !env.FALKORDB_PORT || !env.FALKORDB_GRAPH || !env.API_TENANT_ID) throw new Error('Hosted graph configuration is required');
  const witness = await prepareWitnessSnapshot(env);
  const client = new GraphClient(configFromEnv(env));
  const readerToken = randomBytes(32).toString('hex');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sessions = {
    authenticate(token) {
      const presented = Buffer.from(token);
      const expected = Buffer.from(readerToken);
      return presented.length === expected.length && timingSafeEqual(presented, expected) ? { id: 'serena', kind: 'reader' } : null;
    },
  };
  const status = {
    graphName: client.config.graphName,
    async check() {
      const health = await graphHealth(client);
      return health.ok ? { state: 'available' } : { state: 'unavailable', reason: health.reason };
    },
  };
  const analysis = {
    analyze: (releaseId, requestId) => analyzeRelease(client, env.API_TENANT_ID, releaseId,
      { requestId, sourceRoot: root, evidenceKey: witness.key, witness }),
  };
  const talker = env.PUBLIC_DEMO_TALK_ENABLED === 'true' ? talkerFromEnv(env) : undefined;
  const handleRequest = createApiHandler({ sessions, status, analysis,
    ideaverse: createGraphIdeaverse(client, root, env.API_TENANT_ID), ...(talker ? { talker } : {}) });
  return { handleRequest, readerToken };
}
