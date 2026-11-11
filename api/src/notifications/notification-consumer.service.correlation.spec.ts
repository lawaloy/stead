import { Logger } from '@nestjs/common';
import { getCorrelationId } from '../observability/request-context';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService correlation binding', () => {
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
    correlationId: 'request_1',
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
    service = new NotificationConsumerService(
      queue as never,
      sms as never,
      {
        recordNotificationPoll: jest.fn(),
        recordNotificationJob: jest.fn(),
      } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('binds the claimed job correlation id while sending OTP', async () => {
    let correlationDuringSend: string | undefined;
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockImplementation(() => {
      correlationDuringSend = getCorrelationId();
      return Promise.resolve({
        ok: true,
        provider: 'twilio',
        response: { sid: 'SM123' },
      });
    });

    await tick();

    expect(correlationDuringSend).toBe('request_1');
    expect(getCorrelationId()).toBeUndefined();
    expect(sms.sendOtp).toHaveBeenCalledWith('+2348012345678', '123456');
    expect(queue.markSucceeded).toHaveBeenCalled();
  });
});
