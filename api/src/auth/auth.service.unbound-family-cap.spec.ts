import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

describe('AuthService unbound family cap eviction', () => {
  let service: AuthService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

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

  it('evicts the oldest family for a device-less sign-in at the cap', async () => {
    prisma.refreshToken.groupBy.mockResolvedValue([
      {
        familyId: 'fam-oldest',
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
      {
        familyId: 'fam-5',
        _min: { familyCreatedAt: new Date('2024-05-01T00:00:00.000Z') },
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
      issueSession({ id: 'user_1', phone: '+2348012345678' }),
    ).resolves.toMatchObject({
      token: 'access_token',
      expiresIn: 900,
    });

    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    const [[evict]] = prisma.refreshToken.updateMany.mock.calls as unknown as [
      [{ where: { familyId: string; revokedAt: null } }],
    ];
    expect(evict.where.familyId).toBe('fam-oldest');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    const [[createArg]] = prisma.refreshToken.create.mock.calls as unknown as [
      [{ data: { deviceHash: string | null } }],
    ];
    expect(createArg.data.deviceHash).toBeNull();
  });
});
