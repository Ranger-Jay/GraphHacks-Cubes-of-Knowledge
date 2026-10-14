import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register({ tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)) });
