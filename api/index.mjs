import { createPublicHandler } from '../hosting/public-handler.mjs';

export default createPublicHandler({
  createRuntime: async () => (await import('../hosting/runtime.mjs')).createHostedRuntime(),
});
