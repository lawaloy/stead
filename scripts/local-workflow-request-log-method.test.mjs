import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStructuredRequestLog } from './local-workflow.mjs';

test('structured request logs fail closed when the countries probe method is not GET', () => {
  assert.throws(
    () =>
      assertStructuredRequestLog(
        `${JSON.stringify({
          message: 'HTTP request completed',
          requestId: 'request_1',
          method: 'POST',
          path: '/auth/countries',
          statusCode: 200,
          durationMs: 4,
        })}\n`,
        'request_1',
      ),
    /missing required fields/,
  );
});
