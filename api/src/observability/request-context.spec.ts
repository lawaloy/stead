import {
  getCorrelationId,
  getOperationId,
  getOperationName,
  runWithCorrelationId,
  runWithOperation,
  runWithRequestId,
} from './request-context';

describe('request context', () => {
  it('binds HTTP requests as a single correlation and operation', () => {
    expect(
      runWithRequestId('req-1', () => ({
        correlationId: getCorrelationId(),
        operationId: getOperationId(),
        operationName: getOperationName(),
      })),
    ).toEqual({
      correlationId: 'req-1',
      operationId: 'req-1',
      operationName: 'http.request',
    });
  });

  it('preserves the HTTP correlation id when a nested operation starts', () => {
    expect(
      runWithRequestId('req-1', () =>
        runWithOperation('poll_123', 'notifications.poll', () => ({
          correlationId: getCorrelationId(),
          operationId: getOperationId(),
          operationName: getOperationName(),
        })),
      ),
    ).toEqual({
      correlationId: 'req-1',
      operationId: 'poll_123',
      operationName: 'notifications.poll',
    });
  });

  it('does not leak context after the callback returns', () => {
    runWithRequestId('req-1', () => undefined);
    expect(getCorrelationId()).toBeUndefined();
    expect(getOperationId()).toBeUndefined();
    expect(getOperationName()).toBeUndefined();
  });

  it('binds a job correlation id without replacing an outer operation', () => {
    expect(
      runWithOperation('poll_123', 'notifications.poll', () =>
        runWithCorrelationId('job-corr', () => ({
          correlationId: getCorrelationId(),
          operationId: getOperationId(),
          operationName: getOperationName(),
        })),
      ),
    ).toEqual({
      correlationId: 'job-corr',
      operationId: 'poll_123',
      operationName: 'notifications.poll',
    });
  });

  it('does not invent an operation when only a correlation id is bound', () => {
    expect(
      runWithCorrelationId('job-corr', () => ({
        correlationId: getCorrelationId(),
        operationId: getOperationId(),
        operationName: getOperationName(),
      })),
    ).toEqual({
      correlationId: 'job-corr',
      operationId: undefined,
      operationName: undefined,
    });
  });
});
