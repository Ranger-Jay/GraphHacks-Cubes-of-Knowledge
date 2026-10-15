import { readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

// Unit suites never silently substitute for the mandatory live graph gate.
const offline = ['bootstrap', 'harness', 'api', 'web', 'scene'];
const mode = process.argv[2] ?? 'unit';
const selected = mode === 'unit' ? offline : mode === 'graph' ? ['graph'] : offline.includes(mode) ? [mode] : null;
if (!selected) throw new Error(`Unknown test suite: ${mode}`);
let executed = 0;
for (const suite of selected) {
  const directory = join('tests', suite);
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (mode !== 'unit') throw new Error(`Required suite is absent: ${directory}`);
    console.log(`${directory}: absent on this branch; no acceptance claimed`);
    continue;
  }
  const files = entries.filter(entry => entry.isFile() && /\.test\.(?:mjs|js|ts|tsx)$/.test(entry.name))
    .map(entry => join(directory, entry.name)).sort();
  if (!files.length) throw new Error(`Present suite contains no runnable tests: ${directory}`);
  const register = join(directory, 'register.mjs');
  let hasRegister = false;
  try { await access(register); hasRegister = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const [index, file] of files.entries()) {
    const imports = hasRegister ? ['--import', `./${register}`] : /\.tsx?$/.test(file) ? ['--import', 'tsx'] : [];
    const env = { ...process.env };
    // Nested node:test launches must execute tests, not inherit the parent worker mode.
    delete env.NODE_TEST_CONTEXT;
    // Graph test files seed and mutate data. Give each its own graph namespace.
    if (suite === 'graph') env.FALKORDB_GRAPH = `${env.FALKORDB_GRAPH ?? 'cubes_test'}__suite_${index}`;
    console.log(`Executing ${file}`);
    const child = spawn(process.execPath, [...imports, '--test', file], { stdio: 'inherit', env });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (status, signal) => resolve(signal ? 1 : status ?? 1));
    });
    if (code !== 0) process.exit(code);
    executed++;
  }
}
if (!executed) throw new Error('No tests executed; this gate cannot pass');
console.log(`Executed ${executed} test file(s); scope=${mode}. Live/product acceptance remains separate.`);
