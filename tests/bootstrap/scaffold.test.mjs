import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

test('bootstrap liveness does not pretend graph or product readiness', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, API_HOST: '127.0.0.1', API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => { throw new Error(`Server exited early: ${stderr}`); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); })
    ]);
    const origin = `http://127.0.0.1:${port}`;
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ready, false);
    const graph = await fetch(`${origin}/api/graph/status`);
    assert.equal(graph.status, 503);
    assert.equal((await graph.json()).status, 'UNAVAILABLE');
    const mutation = await fetch(`${origin}/api/approvals`, {method: 'POST'});
    assert.equal(mutation.status, 404);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});
