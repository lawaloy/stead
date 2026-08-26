import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

const PHONE_HOURLY_LIMIT = Number(
  process.env.AUTH_OTP_REQUEST_LIMIT_PER_HOUR ?? '10',
);

describe('Auth OTP lifecycle edges (e2e)', () => {
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

  async function requestOtp(phone: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone, countryIso: 'NG' })
      .expect(201);
    return response.body as { ok: true; otp: string };
  }

  it('lists auth-enabled countries for the mobile selector', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/countries')
      .expect(200);

    const body = response.body as {
      countries: {
        iso: string;
        authEnabled: boolean;
        defaultCountry: boolean;
      }[];
    };
    const isos = body.countries.map((country) => country.iso);

    expect(body.countries.length).toBeGreaterThan(0);
    expect(isos).toEqual(expect.arrayContaining(['NG', 'US', 'GB']));
    expect(body.countries.every((country) => country.authEnabled)).toBe(true);
    expect(
      body.countries.some(
        (country) => country.iso === 'NG' && country.defaultCountry,
      ),
    ).toBe(true);
  });

  it('rejects OTP requests when the phone does not match the selected country', async () => {
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: '+14155552671', countryIso: 'NG' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'phone must match the selected country',
        });
      });

    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.otpCode.count()).resolves.toBe(0);
    await expect(prisma.authEvent.count()).resolves.toBe(0);
  });

  it('rejects OTP requests for an unsupported country before writing auth state', async () => {
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: '08012345678', countryIso: 'ZZ' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'countryIso must be supported',
        });
      });

    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.otpCode.count()).resolves.toBe(0);
  });

  it('rejects verification for an unknown phone without creating a user', async () => {
    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: '08099887766', countryIso: 'NG', otp: '123456' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Invalid phone or code',
        });
      });

    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.otpCode.count()).resolves.toBe(0);
    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(0);
  });

  it('rejects a still-correct OTP after the code expires', async () => {
    const { otp } = await requestOtp('08055667788');

    await prisma.otpCode.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: '08055667788', countryIso: 'NG', otp })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'OTP expired or not found',
        });
      });

    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(0);
  });

  it('consumes the OTP and locks verification after too many invalid attempts', async () => {
    const { otp } = await requestOtp('08066778899');
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    await prisma.otpCode.updateMany({
      data: { verifyAttempts: 4 },
    });

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: '08066778899', countryIso: 'NG', otp: wrongOtp })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Too many invalid OTP attempts. Request a new code.',
        });
      });

    const record = await prisma.otpCode.findFirstOrThrow();
    expect(record.verifyAttempts).toBe(5);
    expect(record.consumedAt).toEqual(expect.any(Date));

    const locked = await prisma.authEvent.findFirstOrThrow({
      where: { type: 'otp_verify_locked' },
    });
    expect(locked.metadataJson).toContain('max_attempts_reached');
    expect(locked.otpCodeId).toBe(record.id);
  });

  it('rejects even the correct OTP when the code is already locked', async () => {
    const { otp } = await requestOtp('08077889900');

    await prisma.otpCode.updateMany({
      data: { verifyAttempts: 5 },
    });

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: '08077889900', countryIso: 'NG', otp })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Too many invalid OTP attempts. Request a new code.',
        });
      });

    const record = await prisma.otpCode.findFirstOrThrow();
    expect(record.consumedAt).toBeNull();
    const locked = await prisma.authEvent.findFirstOrThrow({
      where: { type: 'otp_verify_locked' },
    });
    expect(locked.metadataJson).toContain('already_locked');
    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(0);
  });

  it('rate limits OTP requests per phone within the hourly window after cooldown', async () => {
    const phone = '08088990011';
    const normalizedPhone = '+2348088990011';
    const user = await prisma.user.create({
      data: { phone: normalizedPhone },
    });
    const codeHash = await bcrypt.hash('123456', 4);
    const createdAt = new Date(Date.now() - 2 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000);

    await prisma.otpCode.createMany({
      data: Array.from({ length: PHONE_HOURLY_LIMIT }, () => ({
        userId: user.id,
        codeHash,
        createdAt,
        expiresAt,
      })),
    });

    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone, countryIso: 'NG' })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Too many OTP requests. Try again later.',
        });
      });

    const limited = await prisma.authEvent.findFirstOrThrow({
      where: {
        type: 'otp_request_rate_limited',
        phone: normalizedPhone,
      },
    });
    expect(limited.metadataJson).toContain('"window":"1h"');
    expect(limited.metadataJson).not.toContain('"scope"');
    await expect(prisma.otpCode.count()).resolves.toBe(PHONE_HOURLY_LIMIT);
  });

  it('issues only one JWT when the same OTP is verified concurrently', async () => {
    const phone = '08055667788';
    const { otp } = await requestOtp(phone);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone, countryIso: 'NG', otp }),
      request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone, countryIso: 'NG', otp }),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 400]);

    const success = first.status === 201 ? first : second;
    const failure = first.status === 400 ? first : second;
    expect((success.body as { token: string }).token).toEqual(
      expect.any(String),
    );
    expect(failure.body).toMatchObject({
      message: 'OTP expired or not found',
    });

    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(1);
    const record = await prisma.otpCode.findFirstOrThrow();
    expect(record.consumedAt).toEqual(expect.any(Date));
  });

  it('rejects a second verify of a still-correct OTP after it is consumed', async () => {
    const phone = '08033445566';
    const { otp } = await requestOtp(phone);

    const first = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp })
      .expect(201);
    expect((first.body as { token: string }).token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'OTP expired or not found',
        });
      });

    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(1);
    const record = await prisma.otpCode.findFirstOrThrow();
    expect(record.consumedAt).toEqual(expect.any(Date));
  });

  it('rejects a superseded OTP after a newer code is issued', async () => {
    const phone = '08010101010';
    const first = await requestOtp(phone);

    await prisma.otpCode.updateMany({
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    const second = await requestOtp(phone);
    let latestOtp = second.otp;
    if (latestOtp === first.otp) {
      latestOtp = first.otp === '000000' ? '111111' : '000000';
      const newest = await prisma.otpCode.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });
      await prisma.otpCode.update({
        where: { id: newest.id },
        data: { codeHash: await bcrypt.hash(latestOtp, 4) },
      });
    }

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp: first.otp })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Invalid phone or code',
        });
      });

    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(0);

    const afterStale = await prisma.otpCode.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(afterStale).toHaveLength(2);
    expect(afterStale[0]?.consumedAt).toBeNull();
    expect(afterStale[0]?.verifyAttempts).toBe(0);
    expect(afterStale[1]?.consumedAt).toBeNull();
    expect(afterStale[1]?.verifyAttempts).toBe(1);

    const latest = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp: latestOtp })
      .expect(201);
    expect((latest.body as { token: string }).token).toEqual(
      expect.any(String),
    );

    const records = await prisma.otpCode.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(records[0]?.consumedAt).toEqual(expect.any(Date));
    expect(records[1]?.consumedAt).toEqual(expect.any(Date));
    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(1);
  });

  it('rejects a superseded OTP after the newer code has already been consumed', async () => {
    const phone = '08030303030';
    const first = await requestOtp(phone);

    await prisma.otpCode.updateMany({
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    const second = await requestOtp(phone);
    let latestOtp = second.otp;
    if (latestOtp === first.otp) {
      latestOtp = first.otp === '000000' ? '111111' : '000000';
      const newest = await prisma.otpCode.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });
      await prisma.otpCode.update({
        where: { id: newest.id },
        data: { codeHash: await bcrypt.hash(latestOtp, 4) },
      });
    }

    const latest = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp: latestOtp })
      .expect(201);
    expect((latest.body as { token: string }).token).toEqual(
      expect.any(String),
    );

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp: first.otp })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'OTP expired or not found',
        });
      });

    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(1);
    const leftover = await prisma.otpCode.findMany();
    expect(leftover).toHaveLength(2);
    expect(leftover.every((record) => record.consumedAt instanceof Date)).toBe(
      true,
    );
  });

  it('does not consume another user leftover OTP when retiring live codes', async () => {
    const phoneA = '08012121212';
    const phoneB = '08013131313';
    const firstA = await requestOtp(phoneA);

    await prisma.otpCode.updateMany({
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    const secondA = await requestOtp(phoneA);
    let latestA = secondA.otp;
    if (latestA === firstA.otp) {
      latestA = firstA.otp === '000000' ? '111111' : '000000';
      const newest = await prisma.otpCode.findFirstOrThrow({
        where: { user: { phone: '+2348012121212' } },
        orderBy: { createdAt: 'desc' },
      });
      await prisma.otpCode.update({
        where: { id: newest.id },
        data: { codeHash: await bcrypt.hash(latestA, 4) },
      });
    }

    const other = await requestOtp(phoneB);

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: phoneA, countryIso: 'NG', otp: latestA })
      .expect(201);

    const aliceCodes = await prisma.otpCode.findMany({
      where: { user: { phone: '+2348012121212' } },
    });
    expect(aliceCodes).toHaveLength(2);
    expect(
      aliceCodes.every((record) => record.consumedAt instanceof Date),
    ).toBe(true);

    const bobCode = await prisma.otpCode.findFirstOrThrow({
      where: { user: { phone: '+2348013131313' } },
    });
    expect(bobCode.consumedAt).toBeNull();

    const bobVerify = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: phoneB, countryIso: 'NG', otp: other.otp })
      .expect(201);
    expect((bobVerify.body as { token: string }).token).toEqual(
      expect.any(String),
    );

    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(2);
    const consumedBob = await prisma.otpCode.findFirstOrThrow({
      where: { id: bobCode.id },
    });
    expect(consumedBob.consumedAt).toEqual(expect.any(Date));
  });

  it('blocks another OTP request after a successful verify during cooldown', async () => {
    const phone = '08020202020';
    const { otp } = await requestOtp(phone);

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone, countryIso: 'NG' })
      .expect(429)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Please wait before requesting another OTP.',
        });
      });

    const record = await prisma.otpCode.findFirstOrThrow();
    expect(record.consumedAt).toEqual(expect.any(Date));
    const blocked = await prisma.authEvent.findFirstOrThrow({
      where: { type: 'otp_resend_blocked' },
    });
    expect(blocked.otpCodeId).toBe(record.id);
    await expect(prisma.otpCode.count()).resolves.toBe(1);
  });

  it('still accepts the correct OTP after a single invalid attempt', async () => {
    const phone = '08044556677';
    const { otp } = await requestOtp(phone);
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp: wrongOtp })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'Invalid phone or code',
        });
      });

    const afterMiss = await prisma.otpCode.findFirstOrThrow();
    expect(afterMiss.verifyAttempts).toBe(1);
    expect(afterMiss.consumedAt).toBeNull();

    const second = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone, countryIso: 'NG', otp })
      .expect(201);
    expect((second.body as { token: string }).token).toEqual(
      expect.any(String),
    );

    const record = await prisma.otpCode.findFirstOrThrow();
    expect(record.consumedAt).toEqual(expect.any(Date));
    await expect(
      prisma.authEvent.count({ where: { type: 'otp_verify_succeeded' } }),
    ).resolves.toBe(1);
  });
});
