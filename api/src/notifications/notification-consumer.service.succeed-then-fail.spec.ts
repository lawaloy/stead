import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService persist-after-send failure', () => {
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

  const job: NotificationJob = {
    id: 'job_1',
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
      canDeliver: jest.fn().mockReturnValue(true),
    };
    sms = {
      sendOtp: jest.fn(),
      sendMessage: jest.fn(),
    };
    service = new NotificationConsumerService(queue as never, sms as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks a job failed when markSucceeded throws after the provider send succeeds', async () => {
    const persistError = new Error('db write failed');
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockResolvedValue({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM123' },
    });
    queue.markSucceeded.mockRejectedValue(persistError);

    await tick();

    expect(sms.sendOtp).toHaveBeenCalledWith('+2348012345678', '123456');
    expect(queue.markSucceeded).toHaveBeenCalledWith(job, {
      provider: 'twilio',
      providerMessageId: 'SM123',
    });
    expect(queue.markFailed).toHaveBeenCalledWith(job, persistError);
  });
});
