import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parseArgs, buildPlan } from '../../scripts/audio/generate-dialogue.mjs';

const dialogue = JSON.parse(await readFile(new URL('../../scripts/audio/dialogue-v001.json', import.meta.url), 'utf8'));
const config = JSON.parse(await readFile(new URL('../../scripts/audio/voices.example.json', import.meta.url), 'utf8'));
const configured = { ...config, voices: { roy: 'voice_roy', ava: 'voice_ava', guz: 'voice_guz' } };
async function sandbox(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dialogue-offline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'voices.json');
  await writeFile(path, JSON.stringify(configured));
  return { dir, args: ['--generate', '--config', path, '--out', join(dir, 'out'), '--max-characters', '1000'] };
}
const env = { ELEVENLABS_API_KEY: 'TEST_ONLY_NEVER_SEND' };
const fakeAudio = () => new Response(Buffer.from([0x49, 0x44, 0x33, 0x00]), { headers: { 'content-type': 'audio/mpeg' } });

test('default plan with a key present makes zero network calls and writes nothing', async t => {
  const { dir } = await sandbox(t); let calls = 0;
  const plan = await run(['--out', join(dir, 'unused')], { env, fetchImpl: async () => { calls++; throw Error('must not call'); }, report() {} });
  assert.equal(calls, 0); assert.equal(plan.clips.length, 3);
  assert.deepEqual(await readdir(dir), ['voices.json']);
});
test('27 unique clips preserve locked outage copy and omit proposed recovery lines', () => {
  const p = buildPlan(dialogue, config, 'all');
  assert.equal(p.clips.length, 27); assert.equal(new Set(p.clips.map(c => c.filename)).size, 27);
  assert.deepEqual(dialogue.outage, {
    roy: 'FalkorDB is disconnected. Operations are offline.',
    ava: 'I can’t access the company’s knowledge. Information is unavailable until FalkorDB reconnects.',
    guz: 'I can’t verify any sources. I won’t provide an answer without evidence.'
  });
  assert.ok(p.clips.every(c => !c.filename.includes('_10_')));
});
test('invalid scope or cap and missing credentials reject before any network operation', async t => {
  assert.throws(() => parseArgs(['--scope', 'recovery']));
  assert.throws(() => parseArgs(['--max-characters', 'Infinity']));
  const { args } = await sandbox(t); let calls = 0;
  const options = { env: {}, fetchImpl: async () => { calls++; return fakeAudio(); }, report() {} };
  await assert.rejects(run(args.slice(0, -1).concat('1'), options), /character count/);
  await assert.rejects(run(args, options), /missing/);
  assert.equal(calls, 0);
});
test('synthetic successful responses get receipts; second run verifies instead of re-billing', async t => {
  const { dir, args } = await sandbox(t); let calls = 0;
  const options = { env, report() {}, fetchImpl: async (url, init) => {
    calls++; assert.ok(url.startsWith('https://api.elevenlabs.io/'));
    assert.equal(init.redirect, 'error'); return fakeAudio();
  } };
  await run(args, options); assert.equal(calls, 3);
  const receipt = await readFile(join(dir, 'out', 'roy_09_outage_v001.mp3.json'), 'utf8');
  assert.ok(!receipt.includes(env.ELEVENLABS_API_KEY));
  assert.equal(JSON.parse(receipt).playbackVerified, false);
  await run(args, options); assert.equal(calls, 3);
});
test('an ambiguous provider failure prevents retry and retains the attempt for reconciliation', async t => {
  const { dir, args } = await sandbox(t); let calls = 0;
  const options = { env, report() {}, fetchImpl: async () => { calls++; throw Error('network lost after submission'); } };
  await assert.rejects(run(args, options), /interrupted/);
  assert.equal(calls, 1);
  await assert.rejects(run(args, options), /EEXIST/);
  assert.equal(calls, 1);
  const files = await readdir(join(dir, 'out'));
  assert.ok(files.includes('roy_09_outage_v001.mp3.attempt.json'));
  assert.ok(files.includes('.generation-lock'));
});
test('HTTP error stops without saving it as speech or leaking the body', async t => {
  const { dir, args } = await sandbox(t); let calls = 0;
  await assert.rejects(run(args, { env, report() {}, fetchImpl: async () => {
    calls++; return new Response('sensitive upstream diagnostic', { status: 401 });
  } }), error => /HTTP 401/.test(error.message) && !error.message.includes('sensitive'));
  assert.equal(calls, 1);
  assert.ok(!(await readdir(join(dir, 'out'))).some(x => x.endsWith('.mp3')));
});
test('successful HTTP with a non-audio payload is not saved as speech', async t => {
  const { dir, args } = await sandbox(t); let calls = 0;
  await assert.rejects(run(args, { env, report() {}, fetchImpl: async () => {
    calls++; return new Response('{"error":"not audio"}', { headers: { 'content-type': 'application/json' } });
  } }), /did not return MP3/);
  assert.equal(calls, 1);
  assert.ok(!(await readdir(join(dir, 'out'))).some(x => x.endsWith('.mp3')));
});
