import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

const IP_REQUEST_LIMIT = Number(
  process.env.AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR ?? '8',
);
const IP_VERIFY_LIMIT = Number(
  process.env.AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW ?? '4',
);

describe('Auth OTP IP abuse and resend cooldown (e2e)', () => {
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
      prisma.authEvent.deleteMany(),
      prisma.otpCode.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.user.deleteMany(),
      prisma.notificationJob.deleteMany(),
    ]);
  }

  it('blocks a second OTP request for the same phone during the resend cooldown', async () => {
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: '08033445566', countryIso: 'NG' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: '08033445566', countryIso: 'NG' })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Please wait before requesting another OTP.',
        });
      });

    const blocked = await prisma.authEvent.findFirstOrThrow({
      where: {
        type: 'otp_resend_blocked',
        phone: '+2348033445566',
      },
    });
    expect(blocked.otpCodeId).toEqual(expect.any(String));
    await expect(prisma.otpCode.count()).resolves.toBe(1);
  });

  it('rate limits OTP requests by client IP when the device header is omitted', async () => {
    for (let index = 0; index < IP_REQUEST_LIMIT; index += 1) {
      const phone = `08002${String(index).padStart(6, '0')}`;
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ phone, countryIso: 'NG' })
        .expect(201);
    }

    const requested = await prisma.authEvent.findMany({
      where: { type: 'otp_requested' },
    });
    expect(requested).toHaveLength(IP_REQUEST_LIMIT);
    expect(requested[0]?.ip).toEqual(expect.any(String));
    expect(requested[0]?.ip?.length).toBeGreaterThan(0);
    expect(new Set(requested.map((event) => event.ip)).size).toBe(1);

    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: '08002999999', countryIso: 'NG' })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Too many OTP requests from this network. Try again later.',
        });
      });

    const limited = await prisma.authEvent.findFirstOrThrow({
      where: { type: 'otp_request_rate_limited' },
    });
    expect(limited.ip).toBe(requested[0]?.ip);
    expect(limited.deviceHash).toBeNull();
  }, 30_000);

  it('rate limits OTP verify failures by client IP when the device header is omitted', async () => {
    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: '08003123456', countryIso: 'NG' })
      .expect(201);
    const otp = (otpResponse.body as { otp: string }).otp;
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < IP_VERIFY_LIMIT; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: '08003123456', countryIso: 'NG', otp: wrongOtp })
        .expect(400);
    }

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: '08003123456', countryIso: 'NG', otp })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message:
            'Too many invalid OTP attempts from this network. Try again later.',
        });
      });

    const locked = await prisma.authEvent.findFirstOrThrow({
      where: { type: 'otp_verify_locked' },
    });
    expect(locked.deviceHash).toBeNull();
    expect(locked.ip).toEqual(expect.any(String));
  }, 30_000);
});
