import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_ROUTES,
  HTTP_HEADERS,
} from '../contracts/generated/runtime.gen.mjs';

test('generated HTTP constants preserve the public wire contract', () => {
  assert.deepEqual(HTTP_HEADERS, {
    requestId: 'X-Request-ID',
    idempotencyKey: 'Idempotency-Key',
    steadDeviceId: 'X-Stead-Device-Id',
  });
});

test('generated parameterized routes safely encode path values', () => {
  assert.equal(
    API_ROUTES.updateGoal('goal/with spaces'),
    '/goals/goal%2Fwith%20spaces',
  );
  assert.equal(
    API_ROUTES.endGoal('goal/with spaces'),
    '/goals/goal%2Fwith%20spaces/end',
  );
});
