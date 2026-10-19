import { createPublicHandler } from './public-handler.mjs';

const paths = new Set(['/api/health', '/api/graph/status', '/api/session/access', '/api/releases/rel-wad/analysis', '/api/studio/ideas', '/api/talk']);
const runtime = async () => (await import('./runtime.mjs')).createHostedRuntime();

/** Physical Vercel routes bind the internal API path. Rewrite and protection queries cannot select it. */
export function bindPublicPath(path, options = {}) {
  if (!paths.has(path)) throw new Error('Unsupported public entrypoint');
  const handler = createPublicHandler({ createRuntime: runtime, ...options });
  return (request, response) => {
    request.url = path;
    return handler(request, response);
  };
}

export function bindIdeaDetail(options = {}) {
  const handler = createPublicHandler({ createRuntime: runtime, ...options });
  return (request, response) => {
    const id = request.query?.ideaId;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'The idea identifier is invalid.' } }));
      return;
    }
    request.url = `/api/studio/ideas/${id}`;
    return handler(request, response);
  };
}
