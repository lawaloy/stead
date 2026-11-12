import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStructuredRequestLog } from './local-workflow.mjs';

const completedRequest = (overrides = {}) =>
  `${JSON.stringify({
    message: 'HTTP request completed',
    requestId: 'request_1',
    method: 'GET',
    path: '/auth/countries',
    statusCode: 200,
    durationMs: 4,
    ...overrides,
  })}\n`;

test('structured request logs fail closed when the countries probe fields are wrong', () => {
  assert.throws(
    () =>
      assertStructuredRequestLog(
        completedRequest({ path: '/goals/active' }),
        'request_1',
      ),
    /missing required fields/,
  );
  assert.throws(
    () =>
      assertStructuredRequestLog(
        completedRequest({ statusCode: 500 }),
        'request_1',
      ),
    /missing required fields/,
  );
  assert.throws(
    () =>
      assertStructuredRequestLog(
        completedRequest({ durationMs: '4' }),
        'request_1',
      ),
    /missing required fields/,
  );
});

test('structured request logs fail closed when the expected request id is absent', () => {
  assert.throws(
    () => assertStructuredRequestLog(completedRequest(), 'request_missing'),
    /No structured request log found for request_missing/,
  );
});
