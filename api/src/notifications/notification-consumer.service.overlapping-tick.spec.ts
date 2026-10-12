import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService overlapping poll ticks', () => {
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

  it('skips a second poll while a claim is already in flight so OTP SMS is not sent twice', async () => {
    let releaseClaim: (value: NotificationJob) => void = () => undefined;
    queue.claimReadyJob.mockImplementation(
      () =>
        new Promise<NotificationJob>((resolve) => {
          releaseClaim = resolve;
        }),
    );
    sms.sendOtp.mockResolvedValue({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM123' },
    });

    const first = tick();
    const second = tick();
    await Promise.resolve();

    expect(queue.claimReadyJob).toHaveBeenCalledTimes(1);

    releaseClaim(job);
    await Promise.all([first, second]);

    expect(queue.claimReadyJob).toHaveBeenCalledTimes(1);
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(sms.sendOtp).toHaveBeenCalledWith('+2348012345678', '123456');
    expect(queue.markSucceeded).toHaveBeenCalledTimes(1);
    expect(queue.markSucceeded).toHaveBeenCalledWith(job, {
      provider: 'twilio',
      providerMessageId: 'SM123',
    });
    expect(queue.markFailed).not.toHaveBeenCalled();
  });
});
