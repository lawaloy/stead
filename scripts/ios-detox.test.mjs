import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertDetoxResult,
  assertIosBuild,
  hashIosApp,
  runIosDetox,
} from './ios-detox.mjs';
import { repeatJourneys } from './native-attempts.mjs';

const passed = () => ({
  success: true,
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [{ assertionResults: [{ status: 'passed' }] }],
});
const owned = '00000000-0000-4000-8000-000000000001';

test('pilot refuses empty, skipped, or failed Jest evidence', () => {
  assertDetoxResult(passed());
  for (const summary of [
    {},
    { ...passed(), numPendingTests: 1 },
    { ...passed(), success: false },
    { ...passed(), testResults: [] },
  ])
    assert.throws(() => assertDetoxResult(summary), /exactly one/);
});

test('iOS app identity covers the bundled JS and rejects the wrong backend', () => {
  const app = mkdtempSync(join(tmpdir(), 'stead-detox-app-'));
  try {
    writeFileSync(join(app, 'mobile'), 'launcher');
    writeFileSync(join(app, 'main.jsbundle'), 'original');
    writeFileSync(
      join(app, 'stead-e2e-build.json'),
      JSON.stringify({
        configuration: 'Release',
        apiUrl: 'http://127.0.0.1:3000',
        bundledJavaScript: true,
        phoneSeeded: false,
      }),
    );
    assertIosBuild(app, 'http://127.0.0.1:3000');
    assert.throws(
      () => assertIosBuild(app, 'http://127.0.0.1:3001'),
      /Rebuild/,
    );
    const original = hashIosApp(app);
    writeFileSync(join(app, 'main.jsbundle'), 'changed');
    assert.notEqual(hashIosApp(app), original);
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});

test('driver failure retains its cause, stops repeats, and cleans only the owned simulator', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-fail-'));
  const cleanup = [];
  let attempts = 0;
  try {
    const results = await repeatJourneys(
      3,
      async () => {
        attempts++;
        return runIosDetox(
          { app: '/unused.app', directory, env: {}, phone: '08030000001' },
          {
            detoxVersion: '20.51.1',
            execute: async (command, args, options) => {
              if (args[1] === 'create') return owned;
              if (args.includes('test'))
                throw new Error('exact typed value differs');
              if (['shutdown', 'delete'].includes(args[1])) {
                cleanup.push(args);
                assert.equal(options.signal.aborted, false);
              }
              return '';
            },
          },
        );
      },
      undefined,
      { stopOnFailure: true },
    );
    assert.equal(attempts, 1);
    assert.match(results[0].error, /exact typed value differs/);
    assert.deepEqual(cleanup, [
      ['simctl', 'shutdown', owned],
      ['simctl', 'delete', owned],
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('hung execution has a separate deadline and still releases its owned simulator', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-deadline-'));
  let deleted = false;
  try {
    await assert.rejects(
      runIosDetox(
        { app: '/unused.app', directory, env: {}, phone: '08030000001' },
        {
          detoxVersion: '20.51.1',
          prepareTimeoutMs: 1000,
          testTimeoutMs: 20,
          execute: async (command, args, options) => {
            if (args[1] === 'create') return owned;
            if (args.includes('test'))
              await new Promise((resolve, reject) =>
                options.signal.addEventListener(
                  'abort',
                  () => reject(new Error('hung driver')),
                  { once: true },
                ),
              );
            if (args[1] === 'delete') deleted = true;
            return '';
          },
        },
      ),
      /execution exceeded 20 ms/,
    );
    assert.equal(deleted, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a hung shutdown cannot prevent deletion or leave successful evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-cleanup-'));
  let deleted = false;
  try {
    await assert.rejects(
      runIosDetox(
        { app: '/unused.app', directory, env: {}, phone: '08030000001' },
        {
          detoxVersion: '20.51.1',
          cleanupTimeoutMs: 20,
          execute: async (command, args, options) => {
            if (args[1] === 'create') return owned;
            if (args.includes('test'))
              writeFileSync(
                join(directory, 'summary.json'),
                JSON.stringify(passed()),
              );
            if (args[1] === 'shutdown')
              await new Promise((resolve, reject) =>
                options.signal.addEventListener(
                  'abort',
                  () => reject(new Error('shutdown hung')),
                  { once: true },
                ),
              );
            if (args[1] === 'delete') {
              assert.equal(options.signal.aborted, false);
              deleted = true;
            }
            return '';
          },
        },
      ),
      /shutdown hung/,
    );
    assert.equal(deleted, true);
    assert.equal(
      JSON.parse(readFileSync(join(directory, 'timing.json'), 'utf8')).passed,
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
