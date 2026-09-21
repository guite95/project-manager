import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('four simultaneous 100MiB uploads keep exact bytes under a 96MiB JS heap and bounded RSS', { timeout: 60000 }, async () => {
  const child = spawn(process.execPath, ['--max-old-space-size=96', fileURLToPath(new URL('./large-upload.fixture.mjs', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', c => { output += c; });
  child.stderr.on('data', c => { errors += c; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 55000);
  try {
    const [code, signal] = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', (...args) => resolve(args));
    });
    assert.equal(signal, null, errors);
    assert.equal(code, 0, errors);
    const result = JSON.parse(output.trim());
    assert.equal(result.verified, 4);
    assert.equal(result.bytesEach, 104857600);
    console.log(`large upload peak RSS: ${result.peakRssMiB} MiB`);
  } finally { clearTimeout(timeout); }
});
