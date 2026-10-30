import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const DEVICE_A = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const DEVICE_B = '1a92d3b8-2f7e-4a16-8b2d-14ef9b6c7c88';
const PHONE = '08020112233';
const NORMALIZED_PHONE = '+2348020112233';

describe('Auth device-bound refresh (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function cleanDatabase() {
    if (!prisma) return;

    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
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

  it('binds refresh to the verify device and rejects other devices without killing the family', async () => {
    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('Idempotency-Key', randomUUID())
      .set('X-Stead-Device-Id', DEVICE_A)
      .send({ phone: PHONE, countryIso: 'NG' })
      .expect(201);
    const { otp } = otpResponse.body as { ok: true; otp: string };

    const verified = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .set('Idempotency-Key', randomUUID())
      .set('X-Stead-Device-Id', DEVICE_A)
      .send({ phone: PHONE, countryIso: 'NG', otp })
      .expect(201);
    const first = verified.body as {
      token: string;
      refreshToken: string;
    };
    expect(first.refreshToken).toEqual(expect.any(String));

    const user = await prisma.user.findUniqueOrThrow({
      where: { phone: NORMALIZED_PHONE },
    });
    const bound = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(bound.deviceHash).toBe(hashDevice(DEVICE_A));

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

    await request(app.getHttpServer())
      .get('/account')
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          profile: { id: user.id, phone: NORMALIZED_PHONE },
        });
      });

    const successor = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(successor.deviceHash).toBe(hashDevice(DEVICE_A));
    expect(successor.familyId).toBe(bound.familyId);
  });
});
