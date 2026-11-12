import assert from 'node:assert/strict';
import test from 'node:test';
import { stopOwned } from './process-utils.mjs';

test(
  'stopOwned succeeds when SIGTERM reports ESRCH and the child then closes',
  { skip: process.platform === 'win32' },
  async () => {
    const kills = [];
    const originalKill = process.kill;
    process.kill = (pid, signal) => {
      kills.push([pid, signal]);
      const error = new Error('No such process');
      error.code = 'ESRCH';
      throw error;
    };
    try {
      const child = {
        pid: 4242,
        closed: false,
      };
      child.completion = Promise.resolve().then(() => {
        child.closed = true;
      });
      const started = Date.now();
      await stopOwned(child);
      assert.deepEqual(kills, [[-4242, 'SIGTERM']]);
      assert.equal(child.closed, true);
      assert.ok(Date.now() - started < 1_000);
    } finally {
      process.kill = originalKill;
    }
  },
);

test(
  'stopOwned fails closed when SIGTERM and SIGKILL report ESRCH but the child stays open',
  { skip: process.platform === 'win32' },
  async () => {
    const kills = [];
    const originalKill = process.kill;
    process.kill = (pid, signal) => {
      kills.push([pid, signal]);
      const error = new Error('No such process');
      error.code = 'ESRCH';
      throw error;
    };
    try {
      const started = Date.now();
      await assert.rejects(
        stopOwned({
          pid: 4242,
          closed: false,
          completion: Promise.resolve(),
        }),
        /Owned process 4242 did not stop/,
      );
      assert.deepEqual(kills, [
        [-4242, 'SIGTERM'],
        [-4242, 'SIGKILL'],
      ]);
      assert.ok(Date.now() - started < 1_000);
    } finally {
      process.kill = originalKill;
    }
  },
);
