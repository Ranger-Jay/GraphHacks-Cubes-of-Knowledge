// Loads TSX for web unit tests with the web JSX settings (react-jsx). Run: node --import ./tests/web/register.mjs --test tests/web/*.test.tsx
import { register } from 'tsx/esm/api';
register({ tsconfig: new URL('./tsconfig.json', import.meta.url).pathname });
