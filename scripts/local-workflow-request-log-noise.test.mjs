import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStructuredRequestLog } from './local-workflow.mjs';

const completedRequest = () =>
  JSON.stringify({
    message: 'HTTP request completed',
    requestId: 'request_1',
    method: 'GET',
    path: '/auth/countries',
    statusCode: 200,
    durationMs: 4,
  });

test('structured request logs ignore non-JSON noise and still match the countries probe', () => {
  assert.doesNotThrow(() =>
    assertStructuredRequestLog(
      `Nest application starting\n${completedRequest()}\nnot json\n`,
      'request_1',
    ),
  );
});

test('structured request logs fail closed when output is only non-JSON noise', () => {
  assert.throws(
    () =>
      assertStructuredRequestLog(
        'starting api\n[Nest] LOG mapped {/auth/countries}\n',
        'request_1',
      ),
    /No structured request log found for request_1/,
  );
});
