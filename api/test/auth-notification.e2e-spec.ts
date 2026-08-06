import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { SmsService } from './../src/sms/sms.service';

const OTP_REQUEST_USER_AGENT = 'stead-e2e/otp-pipeline';
const DEVICE_ID = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const SECOND_DEVICE_ID = '908de9d7-7c80-4275-a255-a5f6e1f7246f';
const HAPPY_PATH_PHONE = '08031234567';
const HAPPY_PATH_NORMALIZED_PHONE = '+2348031234567';
const FAILURE_PATH_PHONE = '08051234567';
const FAILURE_PATH_NORMALIZED_PHONE = '+2348051234567';

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor<T>(
  load: () => Promise<T | null>,
  description: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await load();
    if (value !== null) return value;
    await delay(100);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

describe('Auth notification pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sms: SmsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    sms = app.get(SmsService);
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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

  it('persists, sends, and verifies an OTP through the real database pipeline', async () => {
    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('User-Agent', OTP_REQUEST_USER_AGENT)
      .set('X-Stead-Device-Id', DEVICE_ID)
      .send({ phone: HAPPY_PATH_PHONE, countryIso: 'NG' })
      .expect(201);
    const otpBody = otpResponse.body as unknown as {
      ok: boolean;
      otp: string;
    };

    expect(otpBody).toEqual({
      ok: true,
      otp: expect.stringMatching(/^\d{6}$/) as string,
    });
    const { otp } = otpBody;

    const user = await prisma.user.findUniqueOrThrow({
      where: { phone: HAPPY_PATH_NORMALIZED_PHONE },
    });
    const otpCode = await prisma.otpCode.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(otpCode).toMatchObject({
      consumedAt: null,
      verifyAttempts: 0,
      userAgent: OTP_REQUEST_USER_AGENT,
    });
    expect(otpCode.codeHash).not.toContain(otp);

    const requestedEvent = await waitFor(
      () =>
        prisma.authEvent.findFirst({
          where: {
            type: 'otp_requested',
            phone: HAPPY_PATH_NORMALIZED_PHONE,
            userId: user.id,
          },
        }),
      'the persisted otp_requested auth event',
    );
    expect(requestedEvent.countryIso).toBe('NG');
    expect(requestedEvent.userAgent).toBe(OTP_REQUEST_USER_AGENT);
    expect(requestedEvent.deviceHash).toBe(
      createHmac('sha256', process.env.AUTH_DEVICE_IDENTIFIER_SECRET as string)
        .update(DEVICE_ID)
        .digest('hex'),
    );
    expect(JSON.stringify(requestedEvent)).not.toContain(DEVICE_ID);

    const sentJob = await waitFor(async () => {
      const job = await prisma.notificationJob.findFirst({
        where: { type: 'otp.requested' },
        orderBy: { createdAt: 'desc' },
      });
      return job?.status === 'sent' ? job : null;
    }, 'the dev provider to send the persisted notification job');

    expect(sentJob).toMatchObject({
      attempts: 0,
      lastError: null,
      provider: 'dev',
      providerMessageId: null,
    });
    expect(sentJob.sentAt).toBeInstanceOf(Date);
    expect(JSON.parse(sentJob.payloadJson)).toEqual({ redacted: true });

    const verifyResponse = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .set('User-Agent', OTP_REQUEST_USER_AGENT)
      .set('X-Stead-Device-Id', DEVICE_ID)
      .send({
        phone: HAPPY_PATH_PHONE,
        countryIso: 'NG',
        otp,
      })
      .expect(201);
    const verifyBody = verifyResponse.body as unknown as { token: string };

    expect(verifyBody.token).toEqual(expect.any(String));
    const tokenPayload = jwt.verify(
      verifyBody.token,
      process.env.JWT_SECRET as string,
    ) as jwt.JwtPayload;
    expect(tokenPayload).toMatchObject({
      sub: user.id,
      phone: HAPPY_PATH_NORMALIZED_PHONE,
    });

    await request(app.getHttpServer())
      .get('/dashboard/stability')
      .set('Authorization', `Bearer ${verifyBody.token}`)
      .expect(200)
      .expect({ ok: false, message: 'No active goal found' });

    const consumedOtp = await prisma.otpCode.findUniqueOrThrow({
      where: { id: otpCode.id },
    });
    expect(consumedOtp.consumedAt).toBeInstanceOf(Date);

    const verifiedEvent = await waitFor(
      () =>
        prisma.authEvent.findFirst({
          where: {
            type: 'otp_verify_succeeded',
            phone: HAPPY_PATH_NORMALIZED_PHONE,
            userId: user.id,
            otpCodeId: otpCode.id,
          },
        }),
      'the persisted otp_verify_succeeded auth event',
    );
    expect(verifiedEvent.deviceHash).toBe(requestedEvent.deviceHash);
  }, 30_000);

  it('retries provider failures and dead-letters the encrypted OTP payload', async () => {
    const sendOtpSpy = jest
      .spyOn(sms, 'sendOtp')
      .mockRejectedValue(new Error('simulated provider outage'));

    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('User-Agent', OTP_REQUEST_USER_AGENT)
      .send({ phone: FAILURE_PATH_PHONE, countryIso: 'NG' })
      .expect(201);
    const otpBody = otpResponse.body as unknown as { otp: string };
    const { otp } = otpBody;

    const persistedJob = await waitFor(
      () =>
        prisma.notificationJob.findFirst({
          where: { type: 'otp.requested' },
          orderBy: { createdAt: 'desc' },
        }),
      'the persisted notification job',
    );
    expect(persistedJob.payloadJson).not.toContain(otp);

    const deadLetterJob = await waitFor(
      async () => {
        const job = await prisma.notificationJob.findUnique({
          where: { id: persistedJob.id },
        });
        return job?.status === 'dead_letter' ? job : null;
      },
      'the notification job to exhaust retries',
      15_000,
    );

    expect(sendOtpSpy).toHaveBeenCalledTimes(3);
    expect(sendOtpSpy).toHaveBeenCalledWith(FAILURE_PATH_NORMALIZED_PHONE, otp);
    expect(deadLetterJob).toMatchObject({
      attempts: 3,
      maxAttempts: 3,
      lastError: 'simulated provider outage',
      provider: null,
      providerMessageId: null,
      sentAt: null,
    });
    expect(deadLetterJob.failedAt).toBeInstanceOf(Date);
    expect(JSON.parse(deadLetterJob.payloadJson)).toEqual({ redacted: true });
  }, 20_000);

  it('rate limits OTP requests and verification failures by device', async () => {
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('X-Stead-Device-Id', DEVICE_ID)
      .send({ phone: '08021234567', countryIso: 'NG' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('X-Stead-Device-Id', DEVICE_ID)
      .send({ phone: '08041234567', countryIso: 'NG' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('X-Stead-Device-Id', DEVICE_ID)
      .send({ phone: '08061234567', countryIso: 'NG' })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Too many OTP requests from this device. Try again later.',
        });
      });

    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('X-Stead-Device-Id', SECOND_DEVICE_ID)
      .send({ phone: '08071234567', countryIso: 'NG' })
      .expect(201);
    const otp = (otpResponse.body as { otp: string }).otp;
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .set('X-Stead-Device-Id', SECOND_DEVICE_ID)
        .send({ phone: '08071234567', countryIso: 'NG', otp: wrongOtp })
        .expect(400);
    }

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .set('X-Stead-Device-Id', SECOND_DEVICE_ID)
      .send({ phone: '08071234567', countryIso: 'NG', otp })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message:
            'Too many invalid OTP attempts from this device. Try again later.',
        });
      });
  }, 30_000);

  it('exposes abuse trends and queue health only through operator inspection', async () => {
    const operator = await prisma.user.create({
      data: {
        id: 'operator-e2e',
        phone: '+2348099999999',
      },
    });
    await prisma.authEvent.create({
      data: {
        type: 'otp_verify_failed',
        phone: '+2348012345678',
        countryIso: 'NG',
        ip: '203.0.113.5',
        deviceHash:
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      },
    });
    const operatorToken = jwt.sign(
      { sub: operator.id, phone: operator.phone },
      process.env.JWT_SECRET as string,
    );

    const authInspection = await request(app.getHttpServer())
      .get('/auth/inspection')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(authInspection.body).toMatchObject({
      diagnostics: {
        windows: {
          last15Minutes: { otp_verify_failed: 1 },
          lastHour: { otp_verify_failed: 1 },
          last24Hours: { otp_verify_failed: 1 },
        },
        repeatedAbuseLast24Hours: {
          phones: [{ phone: '+234***78', count: 1 }],
          ips: [{ ip: '203.0.113.5', count: 1 }],
          devices: [{ deviceRef: 'device_abcdef0123456789', count: 1 }],
        },
      },
      recent: [
        expect.objectContaining({
          deviceRef: 'device_abcdef0123456789',
        }),
      ],
    });
    expect(JSON.stringify(authInspection.body)).not.toContain(
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    );

    const notificationInspection = await request(app.getHttpServer())
      .get('/notifications/inspection')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const notificationBody = notificationInspection.body as {
      jobs: { health: Record<string, unknown> };
    };
    expect(notificationBody.jobs.health).toMatchObject({
      retrying: 0,
      staleProcessing: 0,
      attemptFailuresLast24Hours: 0,
      deadLettersLast24Hours: 0,
      oldestPending: null,
      lastFailure: null,
    });
  });
});
