import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashRefreshToken } from '../src/auth/refresh-token.util';
import { PrismaService } from '../src/prisma/prisma.service';

const PHONE = '+2348010111666';
const FAMILY_MAX_AGE_MS = 90 * 86_400_000;
const OVER_MAX_AGE_MS = FAMILY_MAX_AGE_MS + 86_400_000;
const RAW_A = 'max-age-family-token-a';
const RAW_B = 'max-age-family-token-b';

describe('Auth refresh family max age (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => cleanDatabase());
  afterEach(async () => cleanDatabase());
  afterAll(async () => app.close());

  async function cleanDatabase() {
    if (!prisma) return;
    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
      prisma.consentRecord.deleteMany(),
      prisma.consentPreference.deleteMany(),
      prisma.alertState.deleteMany(),
      prisma.alertPreference.deleteMany(),
      prisma.authEvent.deleteMany(),
      prisma.notificationJob.deleteMany(),
      prisma.otpCode.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  it('revokes every live row in an aged family even when row expiry is still in the future', async () => {
    const user = await prisma.user.create({
      data: { phone: PHONE },
    });
    const familyId = randomUUID();
    const familyCreatedAt = new Date(Date.now() - OVER_MAX_AGE_MS);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: hashRefreshToken(RAW_A),
          familyId,
          familyCreatedAt,
          expiresAt,
        },
        {
          userId: user.id,
          tokenHash: hashRefreshToken(RAW_B),
          familyId,
          familyCreatedAt,
          expiresAt,
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: RAW_A })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: RAW_B })
      .expect(401);

    await expect(
      prisma.refreshToken.count({
        where: { familyId, revokedAt: null },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.refreshToken.count({
        where: { familyId, revokedAt: { not: null } },
      }),
    ).resolves.toBe(2);
  });
});
