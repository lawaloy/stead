import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService readiness jobs with OTP payloads', () => {
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

  it('sends readiness SMS by claimed type even when the payload is an OTP code', async () => {
    const job = {
      id: 'job_1',
      type: 'risk.alert',
      payload: {
        phone: '+2348012345678',
        otp: '111222',
      },
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
    } as unknown as NotificationJob;
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendMessage.mockResolvedValue({
      ok: true,
      provider: 'termii',
      response: { message_id: 'msg-1' },
    });

    await tick();

    expect(sms.sendMessage).toHaveBeenCalledWith('+2348012345678', undefined);
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(queue.markSucceeded).toHaveBeenCalledWith(job, {
      provider: 'termii',
      providerMessageId: 'msg-1',
    });
    expect(queue.markFailed).not.toHaveBeenCalled();
  });
});
