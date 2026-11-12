import { PrismaService } from '../prisma/prisma.service';
import { AuthTelemetryService } from './auth-telemetry.service';

describe('AuthTelemetryService recordEvent transaction client', () => {
  let service: AuthTelemetryService;
  let prisma: {
    authEvent: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      authEvent: {
        create: jest.fn().mockResolvedValue({ id: 'root_event' }),
      },
    };
    service = new AuthTelemetryService(prisma as never as PrismaService);
  });

  it('persists otp_verify_succeeded on the injected client instead of root Prisma', async () => {
    const transaction = {
      authEvent: {
        create: jest.fn().mockResolvedValue({ id: 'tx_event' }),
      },
    };

    await service.recordEvent(
      {
        type: 'otp_verify_succeeded',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '203.0.113.10',
        userId: 'user_1',
        otpCodeId: 'otp_1',
        attemptNumber: 1,
      },
      transaction,
    );

    expect(transaction.authEvent.create).toHaveBeenCalledTimes(1);
    expect(transaction.authEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'otp_verify_succeeded',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '203.0.113.10',
        deviceHash: undefined,
        userAgent: undefined,
        attemptNumber: 1,
        userId: 'user_1',
        otpCodeId: 'otp_1',
        metadataJson: undefined,
      },
    });
    expect(prisma.authEvent.create).not.toHaveBeenCalled();
  });
});
