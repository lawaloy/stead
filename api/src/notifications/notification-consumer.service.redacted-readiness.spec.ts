import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService redacted readiness payloads', () => {
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

  it.each(['weekly.summary', 'risk.alert', 'risk.recovery'] as const)(
    'fails closed when a claimed %s payload was already redacted',
    async (type) => {
      const redactedJob = {
        ...job,
        type,
        payload: { phone: '<redacted>', redacted: true } as const,
      };
      queue.claimReadyJob.mockResolvedValue(redactedJob);

      await tick();

      expect(sms.sendMessage).not.toHaveBeenCalled();
      expect(sms.sendOtp).not.toHaveBeenCalled();
      expect(queue.markSucceeded).not.toHaveBeenCalled();
      expect(queue.markFailed).toHaveBeenCalledWith(
        redactedJob,
        expect.objectContaining({
          message: 'Readiness notification payload has been redacted',
        }),
      );
    },
  );
});
