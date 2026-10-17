/** Node-only development proxy. Never import from src/ or expose its configuration through VITE_. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ProxyOptions } from 'vite';
import { bearerInjector, TOKEN_PATTERN } from './dev-proxy';

export const OWNER_REHEARSAL_PREFIX = '/api/owner-rehearsal';
const UPSTREAM_PREFIX = '/api/studio/ideas';

/** An explicit operator opt-in. Missing/malformed credentials fail startup, never fall back to reader. */
export function rehearsalTokenFrom(env: Record<string, string | undefined>): string | null {
  const flag = env['API_OWNER_REHEARSAL'];
  if (flag === undefined || flag === '' || flag === '0') return null;
  if (flag !== '1') throw new Error('API_OWNER_REHEARSAL must be 0 or 1');
  const token = env['API_OWNER_TOKEN'];
  if (token === undefined || !TOKEN_PATTERN.test(token)) throw new Error('Owner rehearsal requires a usable API_OWNER_TOKEN');
  if (token === env['API_READER_TOKEN'] || token === env['API_AGENT_TOKEN']) throw new Error('Owner rehearsal requires distinct session tokens');
  return token;
}

/** Positive allowlist: no approvals, arbitrary API routes, query strings, encoded paths or alternate methods. */
export function rehearsalTarget(method: string | undefined, url: string | undefined): string | null {
  if (url === undefined || !url.startsWith(OWNER_REHEARSAL_PREFIX)) return null;
  const suffix = url.slice(OWNER_REHEARSAL_PREFIX.length);
  if (method === 'GET' && /^\/studio\/ideas(?:\/[A-Za-z0-9._~-]{1,128})?$/.test(suffix)) return `/api${suffix}`;
  if (method === 'POST' && /^\/studio\/ideas\/[A-Za-z0-9._~-]{1,128}\/(?:import|import-status)$/.test(suffix)) return `/api${suffix}`;
  return null;
}

export function assertRehearsalBinding(host: unknown, strictPort: unknown): void {
  if (host !== '127.0.0.1' || strictPort !== true) throw new Error('Owner rehearsal requires host 127.0.0.1 and strictPort=true');
}

/** Local processes are trusted operators. Browser writes additionally require the exact local Origin. */
export function rehearsalDenied(request: IncomingMessage, port: number): boolean {
  const remote = request.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1') return true;
  const host = request.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return true;
  const site = request.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return true;
  // A form/no-cors request cannot silently acquire the local owner's write identity.
  if (request.method === 'POST' && (origin !== `http://${host}` || request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json')) return true;
  return false;
}

function refuse(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ error: status === 404 ? 'Rehearsal route unavailable.' : 'Local same-origin rehearsal required.' }));
}

/** Plugin precedes Vite's proxy middleware, so rejected requests never acquire an owner credential. */
export function ownerRehearsalPlugin(enabled: boolean): Plugin {
  return {
    name: 'loopback-owner-rehearsal',
    apply: 'serve',
    configResolved(config) {
      if (enabled) assertRehearsalBinding(config.server.host, config.server.strictPort);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(OWNER_REHEARSAL_PREFIX)) { next(); return; }
        if (!enabled || rehearsalTarget(request.method, request.url) === null) { refuse(response, 404); return; }
        const address = server.httpServer?.address();
        if (address === null || typeof address !== 'object' || rehearsalDenied(request, address.port)) { refuse(response, 403); return; }
        next();
      });
    },
  };
}

export function ownerRehearsalProxy(token: string | null): Record<string, ProxyOptions> {
  if (token === null) return {};
  return {
    [OWNER_REHEARSAL_PREFIX]: {
      target: 'http://127.0.0.1:8787', changeOrigin: false,
      rewrite: path => path.replace(`${OWNER_REHEARSAL_PREFIX}/studio/ideas`, UPSTREAM_PREFIX),
      configure: bearerInjector(token),
    },
  };
}
