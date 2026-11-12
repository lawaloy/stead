import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService canDeliver rejection', () => {
  let service: NotificationConsumerService;
  let queue: {
    claimReadyJob: jest.Mock;
    markSucceeded: jest.Mock;
    markFailed: jest.Mock;
    redactTerminalPayloads: jest.Mock;
    canDeliver: jest.Mock;
  };
  let sms: {
    sendOtp: jest.Mock;
    sendMessage: jest.Mock;
  };
  let metrics: {
    recordNotificationPoll: jest.Mock;
    recordNotificationJob: jest.Mock;
  };

  const job: NotificationJob = {
    id: 'job_1',
    correlationId: 'request_1',
    type: 'otp.requested',
    payload: { phone: '+2348012345678', otp: '123456' },
    status: 'processing',
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: new Date('2026-03-29T12:00:00Z'),
    lockedAt: new Date('2026-03-29T12:00:00Z'),
    sentAt: null,
    failedAt: null,
    lastError: null,
    provider: null,
    providerMessageId: null,
    createdAt: new Date('2026-03-29T12:00:00Z'),
    updatedAt: new Date('2026-03-29T12:00:00Z'),
  };

  const tick = () => (service as unknown as { tick(): Promise<void> }).tick();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    queue = {
      claimReadyJob: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
      redactTerminalPayloads: jest.fn().mockResolvedValue(undefined),
      canDeliver: jest.fn(),
    };
    sms = {
      sendOtp: jest.fn(),
      sendMessage: jest.fn(),
    };
    metrics = {
      recordNotificationPoll: jest.fn(),
      recordNotificationJob: jest.fn(),
    };
    service = new NotificationConsumerService(
      queue as never,
      sms as never,
      metrics as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries a claimed job when the deletion guard throws instead of sending or cancelling', async () => {
    const discoveryError = new Error('deletion discovery unavailable');
    queue.claimReadyJob.mockResolvedValue(job);
    queue.canDeliver.mockRejectedValue(discoveryError);

    await tick();

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(sms.sendMessage).not.toHaveBeenCalled();
    expect(queue.markSucceeded).not.toHaveBeenCalled();
    expect(queue.markFailed).toHaveBeenCalledWith(job, discoveryError);
    expect(metrics.recordNotificationJob).toHaveBeenCalledWith({
      durationMs: expect.any(Number) as unknown,
      outcome: 'retry',
      provider: 'none',
      type: 'otp.requested',
    });
    expect(metrics.recordNotificationPoll).toHaveBeenCalledWith({
      durationMs: expect.any(Number) as unknown,
      outcome: 'processed',
    });
  });
});
