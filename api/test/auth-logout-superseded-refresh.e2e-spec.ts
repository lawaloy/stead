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
const RAW_REFRESH = 'logout-superseded-predecessor';

describe('Auth logout with a superseded refresh token (e2e)', () => {
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

  it('revokes the live successor when logout presents the rotated predecessor', async () => {
    const user = await prisma.user.create({
      data: { phone: PHONE },
    });
    const familyId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(RAW_REFRESH),
        familyId,
        familyCreatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: RAW_REFRESH })
      .expect(201);
    const successor = rotated.body as {
      token: string;
      refreshToken: string;
    };
    expect(successor.refreshToken).toEqual(expect.any(String));
    expect(successor.refreshToken).not.toEqual(RAW_REFRESH);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: RAW_REFRESH })
      .expect(200)
      .expect({ ok: true });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: successor.refreshToken })
      .expect(401);

    await expect(
      prisma.refreshToken.count({
        where: { familyId, revokedAt: null },
      }),
    ).resolves.toBe(0);

    await request(app.getHttpServer())
      .get('/account')
      .set('Authorization', `Bearer ${successor.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          profile: { id: user.id, phone: PHONE },
        });
      });
  });
});
