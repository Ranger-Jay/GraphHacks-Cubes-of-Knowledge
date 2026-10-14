import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ApiError, GraphStatusResponse } from '@cubes/contracts';

// Bootstrap liveness only. No graph connection, authentication or product routes yet.
const host = process.env['API_HOST'] ?? '127.0.0.1';
const port = Number(process.env['API_PORT'] ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');

const server = createServer((request, response) => {
  const requestId = randomUUID();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET' && request.url === '/api/health') {
    response.writeHead(200);
    response.end(JSON.stringify({ status: 'BOOTSTRAP', ready: false, message: 'Server alive; graph and product routes are not implemented.' }));
    return;
  }
  if (request.method === 'GET' && request.url === '/api/graph/status') {
    response.writeHead(503);
    response.end(JSON.stringify({
      status: 'UNAVAILABLE', ready: false, reason: 'NOT_IMPLEMENTED',
      requestId, graphName: process.env['FALKORDB_GRAPH'] ?? 'wad_studio', checkedAt: new Date().toISOString()
    } satisfies GraphStatusResponse));
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not implemented.', requestId } } satisfies ApiError));
});

server.listen(port, host, () => console.log(`Bootstrap API: http://${host}:${port}; product readiness=false`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(error => process.exit(error ? 1 : 0)));
}
