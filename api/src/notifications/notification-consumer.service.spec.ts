import { Logger } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationJob } from './notification.types';

describe('NotificationConsumerService', () => {
  let service: NotificationConsumerService;
  let queue: {
    claimReadyJob: jest.Mock;
    markSucceeded: jest.Mock;
    markFailed: jest.Mock;
  };
  let sms: {
    sendOtp: jest.Mock;
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

    queue = {
      claimReadyJob: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    sms = {
      sendOtp: jest.fn(),
    };
    service = new NotificationConsumerService(queue, sms);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends ready otp jobs and records provider message metadata', async () => {
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockResolvedValue({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM123' },
    });

    await tick();

    expect(sms.sendOtp).toHaveBeenCalledWith('+2348012345678', '123456');
    expect(queue.markSucceeded).toHaveBeenCalledWith('job_1', {
      provider: 'twilio',
      providerMessageId: 'SM123',
    });
    expect(queue.markFailed).not.toHaveBeenCalled();
  });

  it('marks jobs failed when the sms provider rejects', async () => {
    const error = new Error('provider down');
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockRejectedValue(error);

    await tick();

    expect(queue.markSucceeded).not.toHaveBeenCalled();
    expect(queue.markFailed).toHaveBeenCalledWith(job, error);
  });

  it('skips work when no ready job is claimed', async () => {
    queue.claimReadyJob.mockResolvedValue(null);

    await tick();

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(queue.markSucceeded).not.toHaveBeenCalled();
    expect(queue.markFailed).not.toHaveBeenCalled();
  });

  it('marks unsupported job types as failed', async () => {
    queue.claimReadyJob.mockResolvedValue({
      ...job,
      type: 'unknown.event',
    });

    await tick();

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(queue.markSucceeded).not.toHaveBeenCalled();
    expect(queue.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job_1' }),
      expect.objectContaining({
        message: 'Unsupported notification job type',
      }),
    );
  });

  it('records a null provider message id when the sms response has no id', async () => {
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockResolvedValue({
      ok: true,
      provider: 'dev',
      response: { logged: true },
    });

    await tick();

    expect(queue.markSucceeded).toHaveBeenCalledWith('job_1', {
      provider: 'dev',
      providerMessageId: null,
    });
  });

  it.each([null, 'SM123', 42] as const)(
    'records a null provider message id for non-object sms responses (%p)',
    async (response) => {
      queue.claimReadyJob.mockResolvedValue(job);
      sms.sendOtp.mockResolvedValue({
        ok: true,
        provider: 'dev',
        response,
      });

      await tick();

      expect(queue.markSucceeded).toHaveBeenCalledWith('job_1', {
        provider: 'dev',
        providerMessageId: null,
      });
    },
  );

  it.each([{ sid: 123 }, { message_id: true }, { sid: null, message_id: 99 }])(
    'records a null provider message id when sid/message_id are non-strings (%p)',
    async (response) => {
      queue.claimReadyJob.mockResolvedValue(job);
      sms.sendOtp.mockResolvedValue({
        ok: true,
        provider: 'twilio',
        response,
      });

      await tick();

      expect(queue.markSucceeded).toHaveBeenCalledWith('job_1', {
        provider: 'twilio',
        providerMessageId: null,
      });
    },
  );

  it('logs short phones unmasked and longer phones masked on success and failure', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    queue.claimReadyJob.mockResolvedValue({
      ...job,
      payload: { phone: '1234', otp: '123456' },
    });
    sms.sendOtp.mockResolvedValue({
      ok: true,
      provider: 'dev',
      response: { logged: true },
    });

    await tick();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('phone=1234'));
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('phone=1234***'),
    );

    queue.claimReadyJob.mockResolvedValue({
      ...job,
      payload: { phone: '+2348012345678', otp: '123456' },
    });
    sms.sendOtp.mockRejectedValue(new Error('provider down'));

    await tick();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('phone=+234***78'),
    );
  });

  it('does not claim another job while a send is in flight', async () => {
    let resolveSend: (value: {
      ok: boolean;
      provider: string;
      response: Record<string, string>;
    }) => void;
    const sendPromise = new Promise<{
      ok: boolean;
      provider: string;
      response: Record<string, string>;
    }>((resolve) => {
      resolveSend = resolve;
    });
    queue.claimReadyJob.mockResolvedValue(job);
    sms.sendOtp.mockReturnValue(sendPromise);

    const firstTick = tick();
    await Promise.resolve();
    await tick();

    expect(queue.claimReadyJob).toHaveBeenCalledTimes(1);

    resolveSend!({
      ok: true,
      provider: 'termii',
      response: { message_id: 'termii-123' },
    });
    await firstTick;

    expect(queue.markSucceeded).toHaveBeenCalledWith('job_1', {
      provider: 'termii',
      providerMessageId: 'termii-123',
    });
  });
});
