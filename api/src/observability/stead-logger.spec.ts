import {
  createOperationId,
  runWithCorrelationId,
  runWithOperation,
} from './request-context';
import { SteadLogger } from './stead-logger';

describe('SteadLogger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes one-line JSON with correlation and redacted sensitive fields', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new SteadLogger({
      LOG_FORMAT: 'json',
      LOG_LEVEL: 'info',
    });

    runWithCorrelationId('request_123', () => {
      logger.log('Safe event', {
        operation: 'verify',
        phone: '+2348012345678',
        nested: { accessToken: 'secret-token' },
      });
    });

    expect(write).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      message: 'Safe event',
      operation: 'verify',
      phone: '[REDACTED]',
      correlationId: 'request_123',
      nested: { accessToken: '[REDACTED]' },
    });
  });

  it('respects the configured minimum log level', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new SteadLogger({
      LOG_FORMAT: 'json',
      LOG_LEVEL: 'warn',
    });

    logger.log('not emitted');
    logger.warn('emitted');

    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0]?.[0])).toContain('emitted');
  });

  it('keeps operation and correlation identifiers across nested async work', async () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new SteadLogger({
      LOG_FORMAT: 'json',
      LOG_LEVEL: 'info',
    });

    await runWithOperation('poll_123', 'notifications.poll', () =>
      runWithCorrelationId('request_456', async () => {
        await Promise.resolve();
        logger.log('Claimed job');
      }),
    );

    const record = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      message: 'Claimed job',
      operationId: 'poll_123',
      operationName: 'notifications.poll',
      correlationId: 'request_456',
    });
  });

  it('creates recognizable unique identifiers for background operations', () => {
    const first = createOperationId('alerts.scheduler.evaluate');
    const second = createOperationId('alerts.scheduler.evaluate');

    expect(first).toMatch(
      /^alerts\.scheduler\.evaluate:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(second).not.toBe(first);
  });
});
