import { NotificationsService } from './notifications.service';

describe('NotificationsService inspection phone masking', () => {
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
      getStatusSummary: jest.fn().mockResolvedValue({}),
      listRecentJobs: jest.fn(),
    };
    sms = {
      getProviderInspection: jest.fn().mockReturnValue({
        provider: 'dev',
        ready: true,
        config: { exposeOtp: false },
      }),
    };
    service = new NotificationsService(queue as never, sms as never);
  });

  it('masks live E.164 phones and never returns OTP in inspection payloads', async () => {
    queue.listRecentJobs.mockResolvedValue([
      {
        id: 'job_live',
        type: 'otp.requested',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date('2026-03-29T12:00:00Z'),
        lockedAt: null,
        sentAt: null,
        failedAt: null,
        lastError: null,
        provider: null,
        providerMessageId: null,
        createdAt: new Date('2026-03-29T12:00:00Z'),
        updatedAt: new Date('2026-03-29T12:00:00Z'),
        payload: {
          phone: '+2348012345678',
          otp: '654321',
        },
      },
    ]);

    const result = await service.getInspection(5);
    const recent = result.jobs.recent[0];

    expect(recent.payload).toEqual({ phone: '+234***78' });
    expect(recent).not.toHaveProperty('payload.otp');
    expect(JSON.stringify(result)).not.toContain('654321');
    expect(JSON.stringify(result)).not.toContain('+2348012345678');
  });

  it('masks five-character phones with the same prefix/suffix pattern', async () => {
    queue.listRecentJobs.mockResolvedValue([
      {
        id: 'job_five',
        type: 'otp.requested',
        status: 'processing',
        attempts: 1,
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
        payload: {
          phone: '12345',
          otp: '111111',
        },
      },
    ]);

    const result = await service.getInspection(5);

    expect(result.jobs.recent[0].payload).toEqual({ phone: '1234***45' });
    expect(JSON.stringify(result)).not.toContain('111111');
  });
});
