import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService dual OTP and readiness payloads', () => {
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

  const dualPayloadJob = (type: NotificationJob['type']) =>
    ({
      id: `job_${type}`,
      type,
      payload: {
        phone: '+2348012345678',
        otp: '111222',
        body: 'Rent is behind.',
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
    }) as unknown as NotificationJob;

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

  it('sends the OTP code for otp.requested even when a readiness body is also present', async () => {
    const job = dualPayloadJob('otp.requested');
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockResolvedValue({
      ok: true,
      provider: 'dev',
      response: { accepted: true },
    });

    await tick();

    expect(sms.sendOtp).toHaveBeenCalledWith('+2348012345678', '111222');
    expect(sms.sendMessage).not.toHaveBeenCalled();
    expect(queue.markSucceeded).toHaveBeenCalledWith(job, {
      provider: 'dev',
      providerMessageId: null,
    });
    expect(queue.markFailed).not.toHaveBeenCalled();
  });

  it.each(['weekly.summary', 'risk.recovery'] as const)(
    'sends the readiness body for %s even when an OTP code is also present',
    async (type) => {
      const job = dualPayloadJob(type);
      queue.claimReadyJob.mockResolvedValue(job);
      sms.sendMessage.mockResolvedValue({
        ok: true,
        provider: 'termii',
        response: { message_id: `msg-${type}` },
      });

      await tick();

      expect(sms.sendMessage).toHaveBeenCalledWith(
        '+2348012345678',
        'Rent is behind.',
      );
      expect(sms.sendOtp).not.toHaveBeenCalled();
      expect(queue.markSucceeded).toHaveBeenCalledWith(job, {
        provider: 'termii',
        providerMessageId: `msg-${type}`,
      });
      expect(queue.markFailed).not.toHaveBeenCalled();
    },
  );
});
