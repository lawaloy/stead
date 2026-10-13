import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

const DEVICE_SECRET = 'device-secret-at-least-32-chars!!';
const DEVICE_A = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

const hashDevice = (deviceId: string) =>
  createHmac('sha256', DEVICE_SECRET)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');

describe('AuthService same-device replace at family cap', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    refreshToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NOTIFICATION_PUBLISHER,
          useValue: { publishOtpRequested: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('access_token') },
        },
        {
          provide: AuthTelemetryService,
          useValue: {
            recordEvent: jest.fn(),
            countRecentEvents: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string | number> = {
                JWT_SECRET: 'test-jwt-secret-16',
                JWT_EXPIRES_IN: '15m',
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
                AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
                AUTH_REFRESH_MAX_FAMILIES_PER_USER: 5,
                AUTH_DEVICE_IDENTIFIER_SECRET: DEVICE_SECRET,
              };
              return values[key];
            }),
          },
        },
        {
          provide: CountriesService,
          useValue: { requireAuthCountry: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('replaces the same-device family at the cap without evicting other devices', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([
      { familyId: 'fam-on-device-a' },
    ]);
    // groupBy runs after same-device revoke, so the replaced family is gone.
    prisma.refreshToken.groupBy.mockResolvedValue([
      {
        familyId: 'fam-oldest-other',
        _min: { familyCreatedAt: new Date('2024-01-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-2',
        _min: { familyCreatedAt: new Date('2024-02-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-3',
        _min: { familyCreatedAt: new Date('2024-03-01T00:00:00.000Z') },
      },
      {
        familyId: 'fam-4',
        _min: { familyCreatedAt: new Date('2024-04-01T00:00:00.000Z') },
      },
    ]);

    type IssueSession = (
      user: { id: string; phone: string },
      deviceHash?: string | null,
    ) => Promise<{ token: string; refreshToken: string; expiresIn: number }>;

    const issueSession = (
      service as unknown as {
        issueSession: IssueSession;
      }
    ).issueSession.bind(service) as IssueSession;

    await expect(
      issueSession(
        { id: 'user_1', phone: '+2348012345678' },
        hashDevice(DEVICE_A),
      ),
    ).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    const revokes = prisma.refreshToken.updateMany.mock.calls as unknown as [
      [{ where: { familyId: string; revokedAt: null } }],
    ];
    expect(revokes.map(([arg]) => arg.where.familyId)).toEqual([
      'fam-on-device-a',
    ]);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });
});
