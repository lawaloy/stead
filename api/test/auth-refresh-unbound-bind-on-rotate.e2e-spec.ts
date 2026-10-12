import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashRefreshToken } from '../src/auth/refresh-token.util';
import { PrismaService } from '../src/prisma/prisma.service';

const DEVICE_A = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const DEVICE_B = '1a92d3b8-2f7e-4a16-8b2d-14ef9b6c7c88';
const PHONE = '+2348020113344';
const RAW_REFRESH = 'unbound-then-bind-refresh';

describe('Auth refresh binds an unbound family (e2e)', () => {
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

  function hashDevice(deviceId: string) {
    return createHmac(
      'sha256',
      process.env.AUTH_DEVICE_IDENTIFIER_SECRET as string,
    )
      .update(deviceId.toLowerCase(), 'utf8')
      .digest('hex');
  }

  it('binds on first device-bearing refresh and then rejects other devices without killing the family', async () => {
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

    const bound = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('X-Stead-Device-Id', DEVICE_A)
      .send({ refreshToken: RAW_REFRESH })
      .expect(201);
    const first = bound.body as { token: string; refreshToken: string };
    expect(first.refreshToken).toEqual(expect.any(String));
    expect(first.refreshToken).not.toEqual(RAW_REFRESH);

    const successor = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(successor.deviceHash).toBe(hashDevice(DEVICE_A));
    expect(successor.familyId).toBe(familyId);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('X-Stead-Device-Id', DEVICE_B)
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    await expect(
      prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).resolves.toBe(1);

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('X-Stead-Device-Id', DEVICE_A)
      .send({ refreshToken: first.refreshToken })
      .expect(201);
    const second = rotated.body as { token: string; refreshToken: string };
    expect(second.refreshToken).toEqual(expect.any(String));
    expect(second.refreshToken).not.toEqual(first.refreshToken);

    const next = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(next.deviceHash).toBe(hashDevice(DEVICE_A));
    expect(next.familyId).toBe(familyId);

    await request(app.getHttpServer())
      .get('/account')
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          profile: { id: user.id, phone: PHONE },
        });
      });
  });
});
