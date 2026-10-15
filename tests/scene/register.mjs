import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import { register as registerTsx } from 'tsx/esm/api';

try {
  register('./css-loader.mjs', import.meta.url);
} catch {
  // Fallback if loader registration is not supported
}

registerTsx({ tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)) });
