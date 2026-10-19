import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as viteServer } from 'vite';
import { bearerInjector } from '../../apps/web/dev-proxy';
import { ownerRehearsalPlugin, ownerRehearsalProxy, rehearsalTarget } from '../../apps/web/owner-rehearsal';

const opaque = () => randomBytes(24).toString('hex');

test('only the exact GET session/access alias entry maps to the upstream access route', () => {
  const prefix = '/api/owner-rehearsal';
  assert.equal(rehearsalTarget('GET', `${prefix}/session/access`), '/api/session/access');
  for (const [method, path] of [
    ['POST', '/session/access'],
    ['PUT', '/session/access'],
    ['DELETE', '/session/access'],
    ['GET', '/session/access?role=owner'],
    ['GET', '/session/access/'],
    ['GET', '/session/access/extra'],
    ['GET', '/session/accessible'],
    ['GET', '/session'],
  ]) assert.equal(rehearsalTarget(method, `${prefix}${path}`), null);
});

test('real Vite transport: alias reports OWNER, ordinary path reports READER, refusals never reach upstream', { timeout: 30000 }, async () => {
  const owner = opaque(), reader = opaque(), attacker = opaque();
  const observed: { path: string; auth: string | undefined }[] = [];
  const upstream = httpServer((request, response) => {
    observed.push({ path: request.url!, auth: request.headers.authorization });
    // Test-only upstream: exercise proxy identity/transport, not a graph access claim.
    let body: unknown = { received: true };
    if (request.url === '/api/session/access') {
      body = request.headers.authorization === `Bearer ${owner}`
        ? { access: 'OWNER', canReadIdeas: true, canImportIdeas: true }
        : request.headers.authorization === `Bearer ${reader}`
          ? { access: 'READER', canReadIdeas: true, canImportIdeas: false }
          : { error: { code: 'UNAUTHENTICATED', message: 'Session access was not read.', requestId: 'test-only' } };
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const target = `http://127.0.0.1:${address.port}`;
  const ask = (port: number, path: string, method = 'GET', headers: Record<string, string> = {}) => new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, text }));
    });
    request.on('error', reject); request.end(method === 'POST' ? '{}' : undefined);
  });
  try {
    for (const enabled of [false, true]) {
      const ownerProxy = ownerRehearsalProxy(enabled ? owner : null);
      for (const entry of Object.values(ownerProxy)) entry.target = target;
      const vite = await viteServer({
        configFile: false, root: fileURLToPath(new URL('../../apps/web', import.meta.url)),
        logLevel: 'silent', plugins: [ownerRehearsalPlugin(enabled)],
        server: { host: '127.0.0.1', port: 0, strictPort: true, proxy: {
          ...ownerProxy, '/api': { target, configure: bearerInjector(reader) },
        } },
      });
      try {
        await vite.listen();
        const local = vite.httpServer!.address(); assert.ok(local && typeof local === 'object');
        const origin = `http://127.0.0.1:${local.port}`;
        const alias = '/api/owner-rehearsal/session/access';
        const prior = observed.length;
        const aliasRead = await ask(local.port, alias);
        assert.equal(aliasRead.status, enabled ? 200 : 404);
        assert.equal(observed.length, prior + (enabled ? 1 : 0));
        if (!enabled) continue;
        assert.deepEqual(observed.at(-1), { path: '/api/session/access', auth: `Bearer ${owner}` });
        assert.deepEqual(JSON.parse(aliasRead.text), { access: 'OWNER', canReadIdeas: true, canImportIdeas: true });

        const ordinary = await ask(local.port, '/api/session/access', 'GET', { Authorization: `Bearer ${attacker}` });
        assert.equal(ordinary.status, 200);
        assert.deepEqual(observed.at(-1), { path: '/api/session/access', auth: `Bearer ${reader}` });
        assert.deepEqual(JSON.parse(ordinary.text), { access: 'READER', canReadIdeas: true, canImportIdeas: false });

        const attackerAlias = await ask(local.port, alias, 'GET', { Authorization: `Bearer ${attacker}` });
        assert.equal(attackerAlias.status, 200);
        assert.deepEqual(observed.at(-1), { path: '/api/session/access', auth: `Bearer ${owner}` });
        assert.deepEqual(JSON.parse(attackerAlias.text), { access: 'OWNER', canReadIdeas: true, canImportIdeas: true });

        for (const [method, path, headers] of [
          ['POST', alias, { Origin: origin, 'Content-Type': 'application/json' }],
          ['GET', `${alias}?role=owner`, {}],
          ['GET', `${alias}/`, {}],
          ['GET', `${alias}/extra`, {}],
          ['GET', alias, { Origin: 'http://evil.example' }],
          ['GET', alias, { 'Sec-Fetch-Site': 'cross-site' }],
          ['GET', alias, { Host: 'evil.example' }],
        ] as const) {
          const before = observed.length;
          assert.equal((await ask(local.port, path, method, headers)).status, method === 'POST' || path !== alias ? 404 : 403);
          assert.equal(observed.length, before);
        }
        assert.ok(!aliasRead.text.includes(owner) && !ordinary.text.includes(reader) && !attackerAlias.text.includes(owner));
      } finally { await vite.close(); }
    }
  } finally { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
