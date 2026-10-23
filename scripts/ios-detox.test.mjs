import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkDetoxRunner,
  detoxEnvironment,
  assertDetoxResult,
  assertIosBuild,
  hashIosApp,
  runIosDetox,
} from './ios-detox.mjs';
import { repeatJourneys } from './native-attempts.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

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
const hostedDevices = () =>
  JSON.stringify({
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [
        {
          udid: owned,
          name: 'iPhone 17',
          isAvailable: true,
          state: 'Shutdown',
        },
      ],
    },
  });

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
            checkRunner: async () => {},
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
          checkRunner: async () => {},
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
          checkRunner: async () => {},
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
    const evidence = JSON.parse(
      readFileSync(join(directory, 'timing.json'), 'utf8'),
    );
    assert.equal(evidence.appTests, 'passed');
    assert.equal(evidence.cleanup.status, 'failed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('readiness precedes backend startup and real assertions; hosted disposal does not change their result', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-hosted-'));
  const order = [];
  try {
    const result = await runIosDetox(
      {
        app: '/unused.app',
        directory,
        env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
        phone: '08030000001',
        beforeTest: async ({ signal }) => {
          assert.equal(signal.aborted, false);
          order.push('backend');
        },
      },
      {
        detoxVersion: '20.51.1',
        checkRunner: async () => {},
        execute: async (_command, args, options) => {
          if (args.includes('devices')) return hostedDevices();
          if (args[1] === 'create') return owned;
          if (args[1] === 'bootstatus') order.push('ready');
          if (args.includes('test')) {
            order.push('assertions');
            assert.equal(options.env.STEAD_DETOX_DEVICE, owned);
            writeFileSync(
              join(directory, 'summary.json'),
              JSON.stringify(passed()),
            );
          }
          if (['shutdown', 'delete'].includes(args[1]))
            throw new Error('Do not tear down the disposable VM simulator');
          return '';
        },
      },
    );
    assert.deepEqual(order, ['ready', 'backend', 'assertions']);
    assert.equal(result.appTests, 'passed');
    assert.equal(result.cleanup.status, 'deferred');
    assert.deepEqual(
      result.timings.map(({ phase, status }) => [phase, status]),
      [
        ['preparation', 'passed'],
        ['readiness', 'passed'],
        ['backend', 'passed'],
        ['execution', 'passed'],
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('hosted readiness failure never starts the backend or app tests and remains a failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-not-ready-'));
  try {
    await assert.rejects(
      runIosDetox(
        {
          app: '/unused.app',
          directory,
          env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
          phone: '08030000001',
          beforeTest: async () =>
            assert.fail('backend started before readiness'),
        },
        {
          detoxVersion: '20.51.1',
          checkRunner: async () => {},
          execute: async (_command, args) => {
            if (args.includes('devices')) return hostedDevices();
            if (args[1] === 'create') return owned;
            if (args[1] === 'bootstatus')
              throw new Error('Data migration is stuck');
            if (args.includes('test'))
              assert.fail('App tests started before readiness');
            return '';
          },
        },
      ),
      /Data migration is stuck/,
    );
    const evidence = JSON.parse(
      readFileSync(join(directory, 'timing.json'), 'utf8'),
    );
    assert.equal(evidence.passed, false);
    assert.equal(evidence.appTests, 'not-run');
    assert.equal(evidence.cleanup.status, 'deferred');
    assert.equal(evidence.timings.at(-1).phase, 'readiness');
    assert.equal(evidence.timings.at(-1).status, 'failed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a hosted assertion failure cannot be hidden by deferred simulator cleanup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-assertion-'));
  try {
    await assert.rejects(
      runIosDetox(
        {
          app: '/unused.app',
          directory,
          env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
          phone: '08030000001',
        },
        {
          detoxVersion: '20.51.1',
          checkRunner: async () => {},
          execute: async (_command, args) => {
            if (args.includes('devices')) return hostedDevices();
            if (args[1] === 'create') return owned;
            if (args.includes('test'))
              throw new Error('Exact keyboard input differs');
            return '';
          },
        },
      ),
      /Exact keyboard input differs/,
    );
    const evidence = JSON.parse(
      readFileSync(join(directory, 'timing.json'), 'utf8'),
    );
    assert.equal(evidence.passed, false);
    assert.equal(evidence.appTests, 'failed');
    assert.equal(evidence.cleanup.status, 'deferred');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('backend startup failure is distinct from readiness and prevents app-test execution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-backend-'));
  try {
    await assert.rejects(
      runIosDetox(
        {
          app: '/unused.app',
          directory,
          env: {},
          phone: '08030000001',
          beforeTest: async () => {
            throw new Error('API migration failed');
          },
        },
        {
          detoxVersion: '20.51.1',
          checkRunner: async () => {},
          execute: async (_command, args) => {
            if (args[1] === 'create') return owned;
            if (args.includes('test'))
              assert.fail('App tests require a ready backend');
            return '';
          },
        },
      ),
      /API migration failed/,
    );
    const evidence = JSON.parse(
      readFileSync(join(directory, 'timing.json'), 'utf8'),
    );
    assert.equal(evidence.passed, false);
    assert.equal(evidence.appTests, 'not-run');
    assert.equal(evidence.cleanup.status, 'passed');
    assert.deepEqual(
      evidence.timings.map(({ phase, status }) => [phase, status]),
      [
        ['preparation', 'passed'],
        ['readiness', 'passed'],
        ['backend', 'failed'],
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the actual Detox CLI launches the locked mobile Jest and discovers the pilot without a simulator', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-detox-discovery-'));
  try {
    await checkDetoxRunner({
      env: detoxEnvironment({
        env: process.env,
        app: '/unused.app',
        directory,
        phone: '08030000001',
      }),
      signal: AbortSignal.timeout(30000),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
