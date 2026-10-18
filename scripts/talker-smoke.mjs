// Explicit one-call local probe. Reads secrets from environment; prints only non-secret result metadata.
// Run with: node --env-file-if-exists=.env scripts/talker-smoke.mjs
const token = process.env.API_READER_TOKEN;
if (!token || !/^[A-Za-z0-9._~-]{8,256}$/.test(token)) throw new Error('Configure the local API_READER_TOKEN first.');
const port = process.env.API_PORT ?? '8787';
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid API_PORT');
const response = await fetch(`http://127.0.0.1:${port}/api/talk`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ persona: 'roy', intent: 'release-gap', releaseId: 'rel-wad' }), signal: AbortSignal.timeout(25_000),
});
if (response.status !== 200) {
  console.log(JSON.stringify({ status: response.status, result: 'No accepted explanation; inspect local configuration and graph readiness.' }));
  process.exitCode = 1;
} else {
  const a = await response.json();
  if (a.status !== 'AVAILABLE' || typeof a.providerRequestId !== 'string' || typeof a.model !== 'string') throw new Error('Malformed talk response');
  console.log(JSON.stringify({ status: response.status, model: a.model, providerRequestId: a.providerRequestId,
    revision: a.revision, clearance: a.clearance, sourceRefIds: a.sourceRefIds, usage: a.usage }));
}
