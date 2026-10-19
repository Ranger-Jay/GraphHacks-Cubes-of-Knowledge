/**
 * Dev-server proxy helpers. Node-side only: imported by vite.config.ts and tests, never by src/.
 * The reader token is read from the server environment (no VITE_ prefix, no `define`), so it
 * cannot reach the browser bundle. The browser never holds or sends a credential.
 */
export const READER_TOKEN_VAR = 'API_READER_TOKEN';
/** Same shape the API accepts for a session token. */
export const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{8,256}$/;

export interface ProxyRequestLike {
  setHeader(name: string, value: string): unknown;
  removeHeader(name: string): unknown;
}
export interface ProxyLike { on(event: 'proxyReq', listener: (request: ProxyRequestLike) => void): unknown }

/** Returns the usable reader token, or null when it is absent or malformed. Never returns or logs a bad value. */
export function readerTokenFrom(env: Record<string, string | undefined>): string | null {
  const token = env[READER_TOKEN_VAR];
  return token !== undefined && TOKEN_PATTERN.test(token) ? token : null;
}

/** Why no token is injected, without ever naming the value. Null when a usable token is present. */
export function readerTokenProblem(env: Record<string, string | undefined>): string | null {
  const token = env[READER_TOKEN_VAR];
  if (token === undefined || token === '') return `${READER_TOKEN_VAR} is not set: protected API routes will answer 401 through this proxy.`;
  return TOKEN_PATTERN.test(token) ? null : `${READER_TOKEN_VAR} is not a usable opaque token: it is not injected.`;
}

/**
 * Builds the `configure` hook for one proxy entry. Any Authorization header sent by the browser is
 * dropped first, so a page cannot pick its own identity; then the server-held reader token is added.
 */
export function bearerInjector(token: string | null): (proxy: ProxyLike) => void {
  return proxy => {
    proxy.on('proxyReq', request => {
      request.removeHeader('authorization');
      if (token !== null) request.setHeader('Authorization', `Bearer ${token}`);
    });
  };
}
