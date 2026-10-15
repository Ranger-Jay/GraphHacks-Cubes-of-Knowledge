import { timingSafeEqual } from 'node:crypto';
import { FalkorDB } from 'falkordb';
import { analyzeRelease, configFromEnv, GraphClient } from '@cubes/graph';
import { createApiServer, type Principal, type ReleaseReader, type SessionStore } from './app.js';

// A dropped socket emits `error`, and closing that client emits it again with no listener.
// Swallow it here so the route can answer 503. The failed query still rejects.
const connectGraph = FalkorDB.connect.bind(FalkorDB);
FalkorDB.connect = (async (options?: Parameters<typeof FalkorDB.connect>[0]) => {
  const db = await connectGraph(options);
  const emit = db.emit.bind(db);
  db.emit = ((event: string | symbol, ...args: unknown[]) => event === 'error' ? true : emit(event, ...args)) as typeof db.emit;
  return db;
}) as typeof FalkorDB.connect;

const host = process.env['API_HOST'] ?? '127.0.0.1';
const port = Number(process.env['API_PORT'] ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');

const tokenPattern = /^[A-Za-z0-9._~-]{8,256}$/;

/** Slot name fixes the principal. The token text never selects a role, a tenant, or a release. */
const sessionSlots: readonly { name: string; principal: Principal }[] = [
  { name: 'API_OWNER_TOKEN', principal: { id: 'kanny', kind: 'owner' } },
  { name: 'API_READER_TOKEN', principal: { id: 'serena', kind: 'reader' } },
  { name: 'API_AGENT_TOKEN', principal: { id: 'roy', kind: 'agent' } },
];

export function sessionsFromEnv(env: NodeJS.ProcessEnv = process.env): SessionStore {
  const accepted: { token: string; principal: Principal }[] = [];
  for (const slot of sessionSlots) {
    const token = env[slot.name];
    if (token === undefined || token === '') continue;
    if (!tokenPattern.test(token)) throw new Error(`${slot.name} is not a usable opaque session token`);
    if (accepted.some(entry => entry.token === token)) throw new Error('Session tokens must be distinct');
    accepted.push({ token, principal: slot.principal });
  }
  return {
    authenticate(presented: string): Principal | null {
      for (const entry of accepted) {
        const left = Buffer.from(presented);
        const right = Buffer.from(entry.token);
        if (left.length === right.length && timingSafeEqual(left, right)) return { ...entry.principal };
      }
      return null;
    },
  };
}

const tenantId = process.env['API_TENANT_ID'];
const graphClient = new GraphClient(configFromEnv());
const analysis: ReleaseReader | undefined = typeof tenantId === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(tenantId)
  ? { analyze: (releaseId, requestId) => analyzeRelease(graphClient, tenantId, releaseId, { requestId }) }
  : undefined;
const sessions = sessionsFromEnv();

const server = createApiServer({ sessions, ...(analysis === undefined ? {} : { analysis }) });
server.listen(port, host, () => console.log(`Bootstrap API: http://${host}:${port}; product readiness=false`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(error => {
    void graphClient.close().finally(() => process.exit(error ? 1 : 0));
  }));
}
