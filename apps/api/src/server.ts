import { createApiServer } from './app.js';

const host = process.env['API_HOST'] ?? '127.0.0.1';
const port = Number(process.env['API_PORT'] ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');

const server = createApiServer();
server.listen(port, host, () => console.log(`Bootstrap API: http://${host}:${port}; product readiness=false`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(error => process.exit(error ? 1 : 0)));
}
