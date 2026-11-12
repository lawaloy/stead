import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand } from './process-utils.mjs';

test('runCommand writes provided stdin before waiting for the child', async () => {
  const output = await runCommand(
    process.execPath,
    [
      '-e',
      'process.stdin.setEncoding("utf8"); let data = ""; process.stdin.on("data", (chunk) => { data += chunk; }); process.stdin.on("end", () => { process.stdout.write(data); });',
    ],
    { quiet: true, stdoutOnly: true, input: 'no\n' },
  );

  assert.equal(output, 'no\n');
});
