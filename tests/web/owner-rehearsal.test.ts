import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { createServer as httpServer, request as httpRequest, type IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as viteServer } from 'vite';
import { bearerInjector } from '../../apps/web/dev-proxy';
import { assertRehearsalBinding, ownerRehearsalPlugin, ownerRehearsalProxy, rehearsalDenied, rehearsalTarget, rehearsalTokenFrom } from '../../apps/web/owner-rehearsal';

const opaque = () => randomBytes(24).toString('hex');
test('rehearsal is opt-in; invalid flags/credentials fail closed without leaking their value', () => {
  const token = opaque();
  for (const flag of [undefined, '', '0']) assert.equal(rehearsalTokenFrom({ API_OWNER_REHEARSAL: flag, API_OWNER_TOKEN: token }), null);
  assert.equal(rehearsalTokenFrom({ API_OWNER_REHEARSAL: '1', API_OWNER_TOKEN: token }), token);
  for (const env of [
    { API_OWNER_REHEARSAL: 'true', API_OWNER_TOKEN: token },
    { API_OWNER_REHEARSAL: '1', API_OWNER_TOKEN: 'invalid secret' },
    { API_OWNER_REHEARSAL: '1', API_OWNER_TOKEN: token, API_READER_TOKEN: token },
    { API_OWNER_REHEARSAL: '1', API_OWNER_TOKEN: token, API_AGENT_TOKEN: token },
  ]) assert.throws(() => rehearsalTokenFrom(env), error => error instanceof Error && !error.message.includes(token) && !error.message.includes('invalid secret'));
  assert.deepEqual(ownerRehearsalProxy(null), {});
});

test('only canonical IdeaVerse reads/import/recheck routes can acquire the owner identity', () => {
  const prefix = '/api/owner-rehearsal';
  assert.equal(rehearsalTarget('GET', `${prefix}/studio/ideas`), '/api/studio/ideas');
  assert.equal(rehearsalTarget('GET', `${prefix}/studio/ideas/idea-001`), '/api/studio/ideas/idea-001');
  for (const action of ['import', 'import-status']) assert.equal(rehearsalTarget('POST', `${prefix}/studio/ideas/idea-001/${action}`), `/api/studio/ideas/idea-001/${action}`);
  for (const [method, path] of [
    ['POST', '/approvals'], ['GET', '/graph/status'], ['POST', '/studio/ideas'],
    ['DELETE', '/studio/ideas/idea-001/import'], ['OPTIONS', '/studio/ideas'],
    ['POST', '/studio/ideas/idea%2F001/import'], ['POST', '/studio/ideas/idea-001/import?role=owner'],
    ['GET', '/studio/ideas/'], ['POST', '/studio/ideas/idea-001/import/'],
  ]) assert.equal(rehearsalTarget(method, `${prefix}${path}`), null);
});

test('owner rehearsal refuses non-loopback binding and untrusted peer/host/origin/Fetch Metadata', () => {
  for (const host of [true, undefined, '0.0.0.0', '::', 'localhost']) assert.throws(() => assertRehearsalBinding(host, true));
  assert.throws(() => assertRehearsalBinding('127.0.0.1', false));
  assert.doesNotThrow(() => assertRehearsalBinding('127.0.0.1', true));
  const req = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } };
  const denied = (r: unknown) => rehearsalDenied(r as IncomingMessage, 5173);
  assert.equal(denied(req), false);
  assert.equal(denied({ ...req, socket: { remoteAddress: '192.0.2.1' } }), true);
  for (const headers of [
    { ...req.headers, host: 'evil.example:5173' }, { ...req.headers, host: '127.0.0.1:9999' },
    { ...req.headers, origin: 'http://evil.example' }, { ...req.headers, origin: undefined },
    { ...req.headers, 'sec-fetch-site': 'cross-site' }, { ...req.headers, 'sec-fetch-site': 'same-site' },
    { ...req.headers, 'content-type': 'text/plain' },
  ]) assert.equal(denied({ ...req, headers }), true);
});

test('Vite refuses a command-line style public bind override when rehearsal is enabled', async () => {
  await assert.rejects(viteServer({
    configFile: false, logLevel: 'silent', plugins: [ownerRehearsalPlugin(true)],
    server: { host: '0.0.0.0', strictPort: true },
  }), /requires host 127\.0\.0\.1/);
});

test('real Vite transport: reader unchanged; guarded alias uses owner; refusals never reach upstream', { timeout: 30000 }, async () => {
  const owner = opaque(), reader = opaque(), attacker = opaque();
  const observed: { path: string; auth: string | undefined }[] = [];
  const upstream = httpServer((request, response) => {
    observed.push({ path: request.url!, auth: request.headers.authorization });
    // Test-only upstream: exercise proxy identity/transport, not a graph import claim.
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ received: true }));
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
        const ordinary = await ask(local.port, '/api/studio/ideas', 'GET', { Authorization: `Bearer ${attacker}` });
        assert.equal(ordinary.status, 200);
        assert.deepEqual(observed.at(-1), { path: '/api/studio/ideas', auth: `Bearer ${reader}` });
        const alias = '/api/owner-rehearsal/studio/ideas/idea-001/import';
        const prior = observed.length;
        const valid = await ask(local.port, alias, 'POST', { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${attacker}` });
        assert.equal(valid.status, enabled ? 200 : 404);
        assert.equal(observed.length, prior + (enabled ? 1 : 0));
        if (enabled) {
          assert.deepEqual(observed.at(-1), { path: '/api/studio/ideas/idea-001/import', auth: `Bearer ${owner}` });
          const recheck = await ask(local.port, `${alias}-status`, 'POST', { Origin: origin, 'Content-Type': 'application/json' });
          assert.equal(recheck.status, 200);
          assert.equal(observed.at(-1)?.path, '/api/studio/ideas/idea-001/import-status');
          const read = await ask(local.port, '/api/owner-rehearsal/studio/ideas');
          assert.equal(read.status, 200); assert.equal(observed.at(-1)?.auth, `Bearer ${owner}`);
          for (const headers of [
            { 'Content-Type': 'application/json' },
            { Origin: 'http://evil.example', 'Content-Type': 'application/json' },
            { Origin: origin, 'Content-Type': 'text/plain' },
            { Origin: origin, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
            { Origin: origin, 'Content-Type': 'application/json', Host: 'evil.example' },
          ]) {
            const before = observed.length;
            assert.equal((await ask(local.port, alias, 'POST', headers)).status, 403);
            assert.equal(observed.length, before);
          }
          const before = observed.length;
          assert.equal((await ask(local.port, '/api/owner-rehearsal/approvals', 'POST', { Origin: origin, 'Content-Type': 'application/json' })).status, 404);
          assert.equal(observed.length, before);
        }
        assert.ok(!valid.text.includes(owner) && !ordinary.text.includes(reader));
      } finally { await vite.close(); }
    }
  } finally { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
