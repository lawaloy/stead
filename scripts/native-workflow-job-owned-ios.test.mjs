import assert from 'node:assert/strict';
import test from 'node:test';
import { IOS_SIMULATOR_RECEIPT_ENV } from './ios-setup.mjs';
import { canReuseJobOwnedIosSimulator } from './native-workflow.mjs';

const receipt = (overrides = {}) => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_RUN_ID: '12345',
  [IOS_SIMULATOR_RECEIPT_ENV.created]: 'true',
  [IOS_SIMULATOR_RECEIPT_ENV.owner]: '12345',
  [IOS_SIMULATOR_RECEIPT_ENV.udid]: 'fresh-udid',
  ...overrides,
});

test('only the fresh simulator created by the current Actions run is reusable', () => {
  assert.equal(canReuseJobOwnedIosSimulator(receipt(), 'fresh-udid'), true);
  assert.equal(
    canReuseJobOwnedIosSimulator(
      receipt({ [IOS_SIMULATOR_RECEIPT_ENV.created]: 'false' }),
      'fresh-udid',
    ),
    false,
  );
  assert.equal(
    canReuseJobOwnedIosSimulator(
      receipt({ [IOS_SIMULATOR_RECEIPT_ENV.owner]: 'older-run' }),
      'fresh-udid',
    ),
    false,
  );
  assert.equal(canReuseJobOwnedIosSimulator(receipt(), 'other-udid'), false);
  assert.equal(
    canReuseJobOwnedIosSimulator(
      receipt({ GITHUB_ACTIONS: 'false' }),
      'fresh-udid',
    ),
    false,
  );
});
