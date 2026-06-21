import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let queue: {
    enqueueOtpRequested: jest.Mock;
    getStatusSummary: jest.Mock;
    listRecentJobs: jest.Mock;
  };
  let sms: {
    getProviderInspection: jest.Mock;
  };

  beforeEach(() => {
    queue = {
      enqueueOtpRequested: jest.fn(),
      getStatusSummary: jest.fn(),
      listRecentJobs: jest.fn(),
    };
    sms = {
      getProviderInspection: jest.fn(),
    };
    service = new NotificationsService(queue, sms);
  });

  it('waits for otp notification jobs to be persisted', async () => {
    queue.enqueueOtpRequested.mockResolvedValue('job_1');

    await expect(
      service.enqueueOtpRequested('+2348012345678', '123456'),
    ).resolves.toEqual({ ok: true, jobId: 'job_1' });

    expect(queue.enqueueOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: '123456',
    });
  });

  it('surfaces notification job persistence failures', async () => {
    queue.enqueueOtpRequested.mockRejectedValue(new Error('database down'));

    await expect(
      service.enqueueOtpRequested('+2348012345678', '123456'),
    ).rejects.toThrow('database down');
  });

  it('returns inspection summary with masked phones', async () => {
    sms.getProviderInspection.mockReturnValue({
      provider: 'termii',
      ready: true,
      config: {
        apiKeyConfigured: true,
        senderIdConfigured: true,
        channel: 'generic',
      },
    });
    queue.getStatusSummary.mockResolvedValue({
      pending: 2,
      dead_letter: 1,
    });
    queue.listRecentJobs.mockResolvedValue([
      {
        id: 'job_1',
        type: 'otp.requested',
        status: 'dead_letter',
        attempts: 3,
        maxAttempts: 3,
        nextRunAt: new Date('2026-03-29T12:00:00Z'),
        lockedAt: null,
        sentAt: null,
        failedAt: new Date('2026-03-29T12:01:00Z'),
        lastError: 'provider down',
        provider: 'termii',
        providerMessageId: null,
        createdAt: new Date('2026-03-29T12:00:00Z'),
        updatedAt: new Date('2026-03-29T12:01:00Z'),
        payload: {
          phone: '+2348012345678',
          otp: '123456',
        },
      },
    ]);

    const result = await service.getInspection(10);

    expect(result).toEqual({
      provider: {
        provider: 'termii',
        ready: true,
        config: {
          apiKeyConfigured: true,
          senderIdConfigured: true,
          channel: 'generic',
        },
      },
      jobs: {
        summary: {
          pending: 2,
          processing: 0,
          sent: 0,
          failed: 0,
          deadLetter: 1,
        },
        recent: [
          expect.objectContaining({
            id: 'job_1',
            payload: { phone: '+234***78' },
          }),
        ],
      },
    });
    expect(result.jobs.recent[0]).not.toHaveProperty('payload.otp');
  });

  it('bounds inspection limit', async () => {
    sms.getProviderInspection.mockReturnValue({
      provider: 'twilio',
      ready: true,
      config: {},
    });
    queue.getStatusSummary.mockResolvedValue({});
    queue.listRecentJobs.mockResolvedValue([]);

    await service.getInspection(500);

    expect(queue.listRecentJobs).toHaveBeenCalledWith(50);
  });
});
