import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand, spawnOwned } from './process-utils.mjs';

const missing = `/no-such-stead-binary-${process.pid}`;

test('runCommand fails closed when the binary cannot be spawned', async () => {
  await assert.rejects(runCommand(missing, [], { quiet: true }), (error) => {
    assert.match(error.message, /ENOENT/);
    assert.match(error.message, new RegExp(missing));
    return true;
  });
});

test('spawnOwned rejects completion when the binary cannot be spawned', async () => {
  const child = spawnOwned(missing, [], { stdio: 'ignore' });
  await assert.rejects(child.completion, (error) => {
    assert.equal(error.code, 'ENOENT');
    return true;
  });
});
