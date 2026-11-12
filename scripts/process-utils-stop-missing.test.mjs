import assert from 'node:assert/strict';
import test from 'node:test';
import { stopOwned } from './process-utils.mjs';

test('stopOwned does not signal process group 0 or already-closed children', async () => {
  const kills = [];
  const originalKill = process.kill;
  process.kill = (...args) => {
    kills.push(args);
    throw new Error(`unexpected process.kill(${args.map(String).join(', ')})`);
  };
  try {
    await stopOwned();
    await stopOwned({});
    await stopOwned({ pid: 0, closed: false });
    await stopOwned({ pid: 4242, closed: true });
    assert.deepEqual(kills, []);
  } finally {
    process.kill = originalKill;
  }
});

test('stopOwned reuses an in-flight stop instead of signaling again', async () => {
  const kills = [];
  const originalKill = process.kill;
  process.kill = (...args) => {
    kills.push(args);
    throw new Error(`unexpected process.kill(${args.map(String).join(', ')})`);
  };
  try {
    let resolveStop;
    const stopping = new Promise((resolve) => {
      resolveStop = resolve;
    });
    const pending = stopOwned({ pid: 4242, closed: false, stopping });
    assert.deepEqual(kills, []);
    resolveStop('done');
    assert.equal(await pending, 'done');
    assert.deepEqual(kills, []);
  } finally {
    process.kill = originalKill;
  }
});
