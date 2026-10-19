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
    let path = request.url ?? '';
    // Vercel passes the rewritten destination URL. Restore only the bounded route parameter;
    // duplicate values or additional query fields remain invalid rather than selecting a route.
    const rewritten = new URL(path, 'http://internal.invalid');
    const route = rewritten.searchParams.getAll('__cubes_path');
    if (rewritten.pathname === '/api/index' && route.length === 1
      && [...rewritten.searchParams.keys()].every(key => key === '__cubes_path')) {
      path = `/api/${route[0]}`;
      request.url = path;
    }
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
    try {
      pending ??= Promise.resolve().then(createRuntime).catch(error => { pending = undefined; throw error; });
      const runtime = await pending;
      if (response.destroyed || request.aborted) return;
      // Replace every caller-provided credential. This token is process-local and never returned.
      request.headers.authorization = `Bearer ${runtime.readerToken}`;
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          response.removeListener('finish', done);
          response.removeListener('close', done);
          response.removeListener('error', failed);
        };
        const done = () => { cleanup(); resolve(); };
        const failed = error => { cleanup(); reject(error); };
        response.once('finish', done);
        response.once('close', done);
        response.once('error', failed);
        try { runtime.server.emit('request', request, response); }
        catch (error) { failed(error); }
      });
    } catch {
      if (!response.headersSent && !response.destroyed) {
        json(response, 503, { error: { code: 'GRAPH_UNAVAILABLE', message: 'Hosted graph configuration or evidence verification is unavailable.', requestId } });
      }
    }
  };
}
