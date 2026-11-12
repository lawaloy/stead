import { AuthTelemetryService } from './auth-telemetry.service';

describe('AuthTelemetryService inspection query failure', () => {
  let service: AuthTelemetryService;
  let prisma: {
    authEvent: {
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      authEvent: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AuthTelemetryService(prisma as never);
  });

  it('fails closed when an inspection aggregation rejects', async () => {
    const failure = new Error('auth_event findMany failed');
    prisma.authEvent.findMany.mockRejectedValue(failure);

    await expect(service.getInspection(10)).rejects.toBe(failure);
  });

  it('fails closed when a window groupBy rejects and does not return partial diagnostics', async () => {
    const failure = new Error('auth_event groupBy failed');
    prisma.authEvent.groupBy.mockRejectedValue(failure);

    await expect(service.getInspection(5)).rejects.toBe(failure);
  });
});
