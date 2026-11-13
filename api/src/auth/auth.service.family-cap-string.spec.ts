import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PUBLISHER } from '../notifications/notification-publisher';
import { CountriesService } from '../countries/countries.service';

type IssueSession = (
  user: { id: string; phone: string },
  deviceHash?: string | null,
) => Promise<{ token: string; refreshToken: string; expiresIn: number }>;

const liveFamilies = [
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
];

describe('AuthService refresh family cap string coercion', () => {
  const createService = async (
    maxFamilies: string,
  ): Promise<{
    service: AuthService;
    prisma: {
      refreshToken: {
        create: jest.Mock;
        findMany: jest.Mock;
        groupBy: jest.Mock;
        updateMany: jest.Mock;
      };
    };
  }> => {
    const prisma = {
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt_new' }),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue(liveFamilies),
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
              const values: Record<string, string | undefined> = {
                JWT_SECRET: 'test-jwt-secret-16',
                JWT_EXPIRES_IN: '15m',
                AUTH_REFRESH_TOKEN_EXPIRES_IN: '30d',
                AUTH_REFRESH_FAMILY_MAX_AGE: '90d',
                AUTH_REFRESH_MAX_FAMILIES_PER_USER: maxFamilies,
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

    return { service: module.get(AuthService), prisma };
  };

  it.each(['2', '2.9'])(
    'evicts to a two-family cap when AUTH_REFRESH_MAX_FAMILIES_PER_USER is %p',
    async (maxFamilies) => {
      const { service, prisma } = await createService(maxFamilies);
      const issueSession = (
        service as unknown as { issueSession: IssueSession }
      ).issueSession.bind(service) as IssueSession;

      await expect(
        issueSession({ id: 'user_1', phone: '+2348012345678' }),
      ).resolves.toMatchObject({
        token: 'access_token',
        expiresIn: 900,
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(4);
      expect(
        prisma.refreshToken.updateMany.mock.calls.map(
          ([arg]: [{ where: { familyId: string } }]) => arg.where.familyId,
        ),
      ).toEqual(['fam-oldest', 'fam-2', 'fam-3', 'fam-4']);
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    },
  );
});
