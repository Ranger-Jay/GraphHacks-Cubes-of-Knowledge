import { analyzeRelease, configFromEnv, GraphClient } from '@cubes/graph';
import { createApiServer, type ReleaseReader } from './app.js';

const host = process.env['API_HOST'] ?? '127.0.0.1';
const port = Number(process.env['API_PORT'] ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');

const tenantId = process.env['API_TENANT_ID'];
const graphClient = new GraphClient(configFromEnv());
const analysis: ReleaseReader | undefined = typeof tenantId === 'string' && /^[A-Za-z0-9._~-]{1,128}$/.test(tenantId)
  ? { analyze: (releaseId, requestId) => analyzeRelease(graphClient, tenantId, releaseId, { requestId }) }
  : undefined;

const server = createApiServer(analysis === undefined ? {} : { analysis });
server.listen(port, host, () => console.log(`Bootstrap API: http://${host}:${port}; product readiness=false`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(error => {
    void graphClient.close().finally(() => process.exit(error ? 1 : 0));
  }));
}
