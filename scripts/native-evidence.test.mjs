import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { findXCTestFailure, summarizeMaestro } from './native-evidence.mjs';
import { runMaestroCommand, repeatJourneys } from './native-attempts.mjs';
import { parseNativeArguments } from './native-config.mjs';

const screenshotFailure = `
request: GET /isScreenStatic
<unknown>:0: error: -[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer] : Failed to get screenshot: Timed out while requesting screenshot.
Test Case '-[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer]' failed (112.917 seconds).
`;
const fixture = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-native-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('a fatal XCTest screenshot failure stops the owned process before the journey deadline', async (t) => {
  const directory = fixture(t);
  const log = join(directory, 'xctest_runner_current.log');
  const attempts = await repeatJourneys(1, () =>
    runMaestroCommand(
      process.execPath,
      [
        '-e',
        'require("node:fs").writeFileSync(process.argv[1], process.argv[2]); setInterval(() => {}, 1000)',
        log,
        screenshotFailure,
      ],
      { quiet: true },
      {
        timeoutMs: 10_000,
        xctestOutput: directory,
        pollIntervalMs: 20,
      },
    ),
  );
  assert.equal(attempts[0].status, 'failed');
  assert.equal(attempts[0].failure.kind, 'xctest-screenshot-timeout');
  assert.equal(attempts[0].failure.log, log);
  assert.match(attempts[0].error, /will not be retried/);
});

test('old XCTest failures and nonfatal screenshot warnings cannot stop a new attempt', async (t) => {
  const directory = fixture(t);
  writeFileSync(join(directory, 'xctest_runner_old.log'), screenshotFailure);
  await runMaestroCommand(
    'unused',
    [],
    {},
    {
      xctestOutput: directory,
      pollIntervalMs: 5,
      timeoutMs: 5_000,
      execute: async (_command, _args, { signal }) => {
        writeFileSync(
          join(directory, 'xctest_runner_new.log'),
          'Failed to get screenshot: Timed out while requesting screenshot.',
        );
        await delay(30, undefined, { signal });
      },
    },
  );
});

test('driver failure classification requires a failed HTTP-server test, not a product assertion or another XCTest', (t) => {
  const directory = fixture(t);
  const log = join(directory, 'device-xctest.log');
  writeFileSync(
    log,
    "Test Case '-[OtherTests testValidation]' failed.\nAssertion is false: 20% is visible",
  );
  assert.equal(findXCTestFailure(directory), undefined);
  writeFileSync(
    log,
    "Test Case '-[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer]' failed.\n",
  );
  assert.equal(findXCTestFailure(directory).kind, 'xctest-server-failed');
});

test('nested Maestro debug paths still classify a current XCTest screenshot failure', (t) => {
  const directory = fixture(t);
  const nested = join(directory, 'invocation-2', 'debug-output');
  mkdirSync(nested, { recursive: true });
  const log = join(nested, 'xctest_runner_current.log');
  writeFileSync(log, screenshotFailure);
  assert.equal(findXCTestFailure(directory).kind, 'xctest-screenshot-timeout');
  assert.equal(findXCTestFailure(directory).log, log);
});

test('a testHttpServer failure in the last 64 KB of a large XCTest log is still classified', (t) => {
  const directory = fixture(t);
  const log = join(directory, 'xctest_runner_current.log');
  writeFileSync(log, `${'x'.repeat(70 * 1024)}${screenshotFailure}`);
  assert.equal(findXCTestFailure(directory).kind, 'xctest-screenshot-timeout');
  assert.equal(findXCTestFailure(directory).log, log);
});

test('unreadable XCTest evidence fails closed as evidence-monitor-failed and is not retried', async (t) => {
  const directory = fixture(t);
  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      {},
      {
        xctestOutput: directory,
        pollIntervalMs: 5,
        timeoutMs: 5_000,
        execute: async () => {
          rmSync(directory, { recursive: true, force: true });
          writeFileSync(directory, 'not-a-directory');
        },
      },
    ),
    (error) =>
      error.nativeFailure?.kind === 'evidence-monitor-failed' &&
      /will not be retried/.test(error.message),
  );
});

test('a successful Maestro exit is still a failed attempt when the XCTest driver already failed', async (t) => {
  const directory = fixture(t);
  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      {},
      {
        xctestOutput: directory,
        pollIntervalMs: 5,
        timeoutMs: 5_000,
        execute: async () => {
          writeFileSync(
            join(directory, 'xctest_runner_new.log'),
            screenshotFailure,
          );
        },
      },
    ),
    (error) =>
      error.nativeFailure?.kind === 'xctest-screenshot-timeout' &&
      /will not be retried/.test(error.message),
  );
});

test('an assertion failure retains its original error and is never reported as an infrastructure pass', async (t) => {
  const directory = fixture(t);
  const assertion = new Error('Assertion is false: 20% is visible');
  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      {},
      {
        xctestOutput: directory,
        execute: async () => {
          throw assertion;
        },
      },
    ),
    (error) => error === assertion,
  );
});

test('caller cancellation remains cancellation even when the driver fails simultaneously', async (t) => {
  const directory = fixture(t);
  const controller = new AbortController();
  const cancelled = new Error('user cancelled');
  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      { signal: controller.signal },
      {
        xctestOutput: directory,
        execute: async () => {
          writeFileSync(
            join(directory, 'xctest_runner_new.log'),
            screenshotFailure,
          );
          controller.abort(cancelled);
          throw cancelled;
        },
      },
    ),
    (error) => error === cancelled,
  );
});

test('command summaries identify a failed field and slow steps without publishing input or credentials', (t) => {
  const directory = fixture(t);
  const flow = join(directory, 'critical-native-journey');
  mkdirSync(flow);
  writeFileSync(
    join(flow, 'commands.json'),
    JSON.stringify([
      {
        command: { inputTextCommand: { text: 'sensitive-input' } },
        metadata: { sequenceNumber: 1, status: 'COMPLETED', duration: 20 },
      },
      {
        command: {
          assertConditionCommand: {
            condition: {
              visible: { idRegex: 'goal-target', textRegex: '1200000' },
            },
          },
        },
        metadata: {
          sequenceNumber: 2,
          status: 'FAILED',
          duration: 90_000,
          error: { message: 'sensitive-error' },
        },
      },
    ]),
  );
  const [summary] = summarizeMaestro(directory);
  assert.equal(summary.failedCommands[0].fieldId, 'goal-target');
  assert.equal(summary.lastCommand.sequence, 2);
  assert.equal(summary.slowestCommands[0].durationMs, 90_000);
  assert.doesNotMatch(JSON.stringify(summary), /sensitive|1200000/);
});

test('Maestro summaries fail closed on unreadable command evidence', (t) => {
  const directory = fixture(t);
  const flow = join(directory, 'flow');
  mkdirSync(flow);
  writeFileSync(join(flow, 'commands.json'), '{not-json');
  assert.throws(() => summarizeMaestro(directory), SyntaxError);
});

test('diagnostic scenarios cannot substitute for the full verify gate or select arbitrary flows', () => {
  assert.equal(
    parseNativeArguments(['test', '--platform', 'ios', '--scenario', 'input'])
      .scenario,
    'input',
  );
  assert.equal(
    parseNativeArguments(['test', '--platform', 'ios']).scenario,
    'journey',
  );
  for (const args of [
    ['verify', '--platform', 'ios', '--scenario', 'input'],
    ['test', '--scenario', 'input'],
    ['test', '--platform', 'ios', '--scenario', '../../custom'],
  ])
    assert.throws(() => parseNativeArguments(args));
});
