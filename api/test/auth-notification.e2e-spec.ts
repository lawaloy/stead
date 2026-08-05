import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { SmsService } from './../src/sms/sms.service';

const OTP_REQUEST_USER_AGENT = 'stead-e2e/otp-pipeline';
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

    await waitFor(
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
});
