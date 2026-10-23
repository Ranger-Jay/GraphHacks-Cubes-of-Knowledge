import { randomUUID } from 'node:crypto';

const readable = path => ['/api/graph/status', '/api/session/access', '/api/studio/ideas', '/api/releases/rel-wad/analysis'].includes(path)
  || /^\/api\/studio\/ideas\/[a-z0-9][a-z0-9-]{0,63}$/.test(path);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

/** A public synthetic-data reader. Caller credentials never choose its identity or unlock writes. */
export function createPublicHandler({ createRuntime, env = process.env }) {
  let pending;
  return async (request, response) => {
    const requestId = randomUUID();
    const path = request.url ?? '';
    if (request.method === 'GET' && path === '/api/health') {
      return json(response, 200, { status: 'BOOTSTRAP', ready: false, message: 'Hosted process alive; graph readiness is separate.' });
    }
    const talk = request.method === 'POST' && path === '/api/talk';
    if (talk && env.PUBLIC_DEMO_TALK_ENABLED !== 'true') {
      return json(response, 503, { error: { code: 'NOT_IMPLEMENTED', message: 'Model explanations are disabled on this public demo.', requestId } });
    }
    if (!(request.method === 'GET' && readable(path)) && !talk) {
      return json(response, request.method === 'GET' ? 404 : 403,
        { error: { code: 'FORBIDDEN', message: 'This public demo permits scoped reading only.', requestId } });
    }
    if (talk && (!env.WEB_ORIGIN || request.headers.origin !== env.WEB_ORIGIN || request.headers['sec-fetch-site'] === 'cross-site')) {
      return json(response, 403, { error: { code: 'FORBIDDEN', message: 'The request origin was refused. The model was not called.', requestId } });
    }
    const controller = new AbortController();
    let timer;
    try {
      const dispatch = async () => {
        pending ??= Promise.resolve().then(createRuntime).catch(error => { pending = undefined; throw error; });
        const runtime = await pending;
        if (controller.signal.aborted || response.destroyed || request.aborted) return;
        // Replace every caller-provided credential. This token never leaves the process.
        request.headers.authorization = `Bearer ${runtime.readerToken}`;
        await runtime.handleRequest(request, response, controller.signal);
      };
      if (talk) {
        // Includes runtime setup, both graph reads and the 25s provider budget.
        // Leave time to send a bounded failure before Vercel's 30s hard limit.
        const deadline = new Promise(resolve => {
          timer = setTimeout(() => {
            controller.abort(new DOMException('Hosted talk deadline exceeded', 'TimeoutError'));
            if (!response.headersSent && !response.destroyed) {
              const message = 'The explanation request timed out. No generated answer is shown.';
              console.error('talk request failed:', requestId, message);
              json(response, 503, { error: { code: 'NOT_IMPLEMENTED', message, requestId } });
            }
            resolve();
          }, 27_000);
        });
        await Promise.race([dispatch(), deadline]);
      } else {
        await dispatch();
      }
    } catch {
      if (!response.headersSent && !response.destroyed) {
        json(response, 503, { error: { code: 'GRAPH_UNAVAILABLE', message: 'Hosted graph configuration or evidence verification is unavailable.', requestId } });
      }
    } finally { clearTimeout(timer); }
  };
}
