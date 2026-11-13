import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findXCTestFailure } from './native-evidence.mjs';

const crlf = (value) => value.replaceAll('\n', '\r\n');

const screenshotFailure = crlf(`
request: GET /isScreenStatic
<unknown>:0: error: -[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer] : Failed to get screenshot: Timed out while requesting screenshot.
Test Case '-[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer]' failed (112.917 seconds).
`);

const serverFailure = crlf(
  "Test Case '-[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer]' failed.\n",
);

const productFailure = crlf(
  "Test Case '-[OtherTests testValidation]' failed.\nAssertion is false: 20% is visible\n",
);

const fixture = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-native-evidence-crlf-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('CRLF XCTest screenshot timeouts are still classified as driver failures', (t) => {
  const directory = fixture(t);
  const log = join(directory, 'device-xctest.log');
  writeFileSync(log, screenshotFailure);
  assert.equal(findXCTestFailure(directory).kind, 'xctest-screenshot-timeout');
  assert.equal(findXCTestFailure(directory).log, log);
});

test('CRLF HTTP-server XCTest failures are still classified without a screenshot timeout', (t) => {
  const directory = fixture(t);
  const log = join(directory, 'xctest_runner_current.log');
  writeFileSync(log, serverFailure);
  assert.equal(findXCTestFailure(directory).kind, 'xctest-server-failed');
  assert.equal(findXCTestFailure(directory).log, log);
});

test('CRLF product assertions still cannot be classified as driver HTTP-server failures', (t) => {
  const directory = fixture(t);
  const log = join(directory, 'device-xctest.log');
  writeFileSync(log, productFailure);
  assert.equal(findXCTestFailure(directory), undefined);
});
