import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const runner = fileURLToPath(new URL('../../scripts/test-suites.mjs', import.meta.url));
async function sandbox(run) {
  const directory = await mkdtemp(join(tmpdir(), 'cubes-suite-harness-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
const invoke = (directory, suite) => spawnSync(process.execPath, [runner, suite], { cwd: directory, encoding: 'utf8' });
test('a mandatory graph gate fails when the graph suite is missing or empty', async () => {
  await sandbox(async directory => {
    assert.notEqual(invoke(directory, 'graph').status, 0);
    await mkdir(join(directory, 'tests/graph'), { recursive: true });
    assert.notEqual(invoke(directory, 'graph').status, 0);
  });
});
test('a discovered API test really executes and its failure rejects the unit gate', async () => {
  await sandbox(async directory => {
    await mkdir(join(directory, 'tests/api'), { recursive: true });
    await writeFile(join(directory, 'tests/api/live.test.mjs'), "import {test} from 'node:test'; test('deliberate failure', () => { throw Error('API_FAILURE_SENTINEL'); });");
    const result = invoke(directory, 'unit');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /API_FAILURE_SENTINEL/);
  });
});
test('a unit gate with no executable tests fails instead of reporting green', async () => {
  await sandbox(async directory => assert.notEqual(invoke(directory, 'unit').status, 0));
});
