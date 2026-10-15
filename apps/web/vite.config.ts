import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { bearerInjector, readerTokenFrom, readerTokenProblem } from './dev-proxy';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Prefix 'API_' keeps this read to the API variables. Values stay in this Node process:
  // nothing here is passed to `define`, so the browser bundle cannot contain them.
  const env = loadEnv(mode, repoRoot, 'API_');
  const problem = readerTokenProblem(env);
  if (problem !== null) console.warn(`[web dev proxy] ${problem}`);
  return {
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: false,
          configure: bearerInjector(readerTokenFrom(env)),
        },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
