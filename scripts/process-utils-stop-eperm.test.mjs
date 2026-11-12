import assert from 'node:assert/strict';
import test from 'node:test';
import { stopOwned } from './process-utils.mjs';

test(
  'stopOwned rethrows non-ESRCH SIGTERM errors instead of waiting for the child',
  { skip: process.platform === 'win32' },
  async () => {
    const kills = [];
    const originalKill = process.kill;
    process.kill = (pid, signal) => {
      kills.push([pid, signal]);
      const error = new Error('Operation not permitted');
      error.code = 'EPERM';
      throw error;
    };
    try {
      const started = Date.now();
      await assert.rejects(
        stopOwned({
          pid: 4242,
          closed: false,
          completion: new Promise(() => {}),
        }),
        (error) => error.code === 'EPERM',
      );
      assert.deepEqual(kills, [[-4242, 'SIGTERM']]);
      assert.ok(Date.now() - started < 1_000);
    } finally {
      process.kill = originalKill;
    }
  },
);

test(
  'stopOwned rethrows non-ESRCH SIGKILL errors after SIGTERM',
  { skip: process.platform === 'win32' },
  async () => {
    const kills = [];
    const originalKill = process.kill;
    process.kill = (pid, signal) => {
      kills.push([pid, signal]);
      if (signal === 'SIGKILL') {
        const error = new Error('Operation not permitted');
        error.code = 'EPERM';
        throw error;
      }
    };
    try {
      const started = Date.now();
      await assert.rejects(
        stopOwned({
          pid: 4242,
          closed: false,
          completion: Promise.resolve(),
        }),
        (error) => error.code === 'EPERM',
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

test(
  'stopOwned fails closed when the child stays open after SIGTERM and SIGKILL',
  { skip: process.platform === 'win32' },
  async () => {
    const kills = [];
    const originalKill = process.kill;
    process.kill = (pid, signal) => {
      kills.push([pid, signal]);
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
