import { readFile, mkdir, open, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = async path => { try { await access(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
async function createExclusive(path, value) {
  const f = await open(path, 'wx', 0o600);
  try { await f.writeFile(value); await f.sync(); } finally { await f.close(); }
}

export function parseArgs(args) {
  const result = { scope: 'outage', generate: false, config: null, out: '.local/agent-dialogue/v001', maxCharacters: null };
  const values = { '--scope': 'scope', '--config': 'config', '--out': 'out', '--max-characters': 'maxCharacters' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--generate') { result.generate = true; continue; }
    if (arg === '--plan') continue;
    const key = values[arg];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Unknown option or missing value; see docs/audio-batch-v027.md');
    result[key] = args[++i];
  }
  if (!['outage', 'all'].includes(result.scope)) throw new Error('Scope must be outage or all');
  if (result.maxCharacters !== null) {
    if (!/^[1-9][0-9]*$/.test(result.maxCharacters)) throw new Error('Character limit must be a positive integer');
    result.maxCharacters = Number(result.maxCharacters);
    if (!Number.isSafeInteger(result.maxCharacters)) throw new Error('Character limit is too large');
  }
  return result;
}

export function buildPlan(dialogue, config, scope) {
  if (!config || typeof config.modelId !== 'string' || !config.modelId.trim()) throw new Error('A modelId is required');
  const clips = [];
  for (const speaker of dialogue.speakers) {
    const phrases = [{ id: '09_outage', text: dialogue.outage[speaker] }];
    if (scope === 'all') phrases.push(...dialogue.phrases);
    for (const phrase of phrases) {
      const request = {
        text: phrase.text,
        model_id: config.modelId,
        voice_settings: config.voiceSettings,
        ...(config.pronunciationDictionaries?.length ? { pronunciation_dictionary_locators: config.pronunciationDictionaries } : {})
      };
      const voiceId = config.voices?.[speaker] || '';
      clips.push({ speaker, text: phrase.text, filename: `${speaker}_${phrase.id}_${dialogue.version}.mp3`,
        voiceId, request, requestHash: hash(JSON.stringify([voiceId, request])) });
    }
  }
  return { scope, clips, characters: clips.reduce((n, c) => n + Array.from(c.text).length, 0) };
}

export async function run(args, { env = process.env, fetchImpl = globalThis.fetch, report = console.log } = {}) {
  const opts = parseArgs(args);
  const dialogue = await readJson(new URL('./dialogue-v001.json', import.meta.url));
  const config = await readJson(opts.config ? resolve(opts.config) : new URL('./voices.example.json', import.meta.url));
  const plan = buildPlan(dialogue, config, opts.scope);
  // The default has no network calls, filesystem output, or secret lookup.
  if (!opts.generate) {
    report(JSON.stringify({ mode: 'PLAN_ONLY', scope: plan.scope, clips: plan.clips.length,
      characters: plan.characters, model: config.modelId,
      files: plan.clips.map(c => ({ speaker: c.speaker, filename: c.filename, text: c.text, voiceConfigured: Boolean(c.voiceId) })) }, null, 2));
    return plan;
  }
  if (!opts.maxCharacters || plan.characters > opts.maxCharacters) throw new Error('Generation requires --max-characters at least the planned character count');
  if (plan.clips.some(c => !/^[a-zA-Z0-9_-]{1,128}$/.test(c.voiceId))) throw new Error('Configure all three selected voice IDs first');
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is missing from server/local environment');
  const out = resolve(opts.out);
  await mkdir(out, { recursive: true, mode: 0o700 });
  const lock = join(out, '.generation-lock');
  await createExclusive(lock, 'Generation attempt started. Reconcile provider history before recovering an interrupted run.\n');
  // Deliberately preserve the lock on any exception: timeouts may have billed the provider.
  for (const clip of plan.clips) {
    const target = join(out, clip.filename);
    const receiptPath = `${target}.json`;
    const attemptPath = `${target}.attempt.json`;
    if (await exists(receiptPath)) {
      const receipt = await readJson(receiptPath);
      if (receipt.requestHash !== clip.requestHash || receipt.sha256 !== hash(await readFile(target))) throw new Error('Existing clip/settings mismatch; use a new version/output directory');
      report(`VERIFIED_EXISTING ${clip.filename}`);
      continue;
    }
    if (await exists(target) || await exists(attemptPath)) throw new Error('Unreconciled attempt/output exists; inspect provider history before any retry');
    // Persist intent before the billable operation. No automatic retry or redirect.
    await createExclusive(attemptPath, JSON.stringify({ filename: clip.filename, requestHash: clip.requestHash, startedAt: new Date().toISOString() }));
    let response;
    try {
      response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(clip.voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify(clip.request)
      });
    } catch { throw new Error('Provider request interrupted; no retry performed. Reconcile the saved attempt with provider history.'); }
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}; stopped without retry (response body withheld)`);
    if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('audio/mpeg')) throw new Error('Provider did not return MP3 audio; attempt retained for reconciliation');
    const bytes = Buffer.from(await response.arrayBuffer());
    const mp3 = bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (!bytes.length || !mp3) throw new Error('Invalid MP3 response; attempt retained for reconciliation');
    await createExclusive(target, bytes);
    await createExclusive(receiptPath, JSON.stringify({ filename: clip.filename, speaker: clip.speaker, transcript: clip.text,
      voiceId: clip.voiceId, modelId: config.modelId, voiceSettings: config.voiceSettings,
      pronunciationDictionaries: config.pronunciationDictionaries || [], outputFormat: 'mp3_44100_128',
      requestHash: clip.requestHash, sha256: hash(bytes), byteCount: bytes.length,
      requestId: response.headers.get('request-id') || null, generatedAt: new Date().toISOString(),
      playbackVerified: false }, null, 2));
    report(`GENERATED_NOT_AUDITIONED ${clip.filename}`);
  }
  const { unlink } = await import('node:fs/promises');
  await unlink(lock);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
