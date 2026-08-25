import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

const VALID_DEVICE_ID = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const OMITTED_HEADER_PHONE = '08081234567';
const OMITTED_HEADER_NORMALIZED = '+2348081234567';

describe('Auth device header (e2e)', () => {
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

  it('rejects malformed X-Stead-Device-Id on request and verify without persisting auth state', async () => {
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('X-Stead-Device-Id', 'device-one')
      .send({ phone: '08091234567', countryIso: 'NG' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'X-Stead-Device-Id must be a valid UUIDv4 identifier',
        });
      });

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .set('X-Stead-Device-Id', '0f81c2a7-1e6d-3f05-9a1c-03de8a5f6b77')
      .send({ phone: '08091234567', countryIso: 'NG', otp: '123456' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'X-Stead-Device-Id must be a valid UUIDv4 identifier',
        });
      });

    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.otpCode.count()).resolves.toBe(0);
    await expect(prisma.authEvent.count()).resolves.toBe(0);
    await expect(prisma.notificationJob.count()).resolves.toBe(0);
  });

  it('lets older clients omit the device header and stores no device hash', async () => {
    const otpResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: OMITTED_HEADER_PHONE, countryIso: 'NG' })
      .expect(201);
    const otpBody = otpResponse.body as { ok: boolean; otp: string };

    expect(otpBody.ok).toBe(true);
    expect(otpBody.otp).toMatch(/^\d{6}$/);

    const requestedEvent = await prisma.authEvent.findFirstOrThrow({
      where: {
        type: 'otp_requested',
        phone: OMITTED_HEADER_NORMALIZED,
      },
    });
    expect(requestedEvent.deviceHash).toBeNull();

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({
        phone: OMITTED_HEADER_PHONE,
        countryIso: 'NG',
        otp: otpBody.otp,
      })
      .expect(201);

    const verifiedEvent = await prisma.authEvent.findFirstOrThrow({
      where: {
        type: 'otp_verify_succeeded',
        phone: OMITTED_HEADER_NORMALIZED,
      },
    });
    expect(verifiedEvent.deviceHash).toBeNull();
  });

  it('still hashes a valid device header on the same request path', async () => {
    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .set('X-Stead-Device-Id', VALID_DEVICE_ID)
      .send({ phone: '08011234567', countryIso: 'NG' })
      .expect(201);

    const requestedEvent = await prisma.authEvent.findFirstOrThrow({
      where: { type: 'otp_requested', phone: '+2348011234567' },
    });
    expect(requestedEvent.deviceHash).toEqual(expect.any(String));
    expect(requestedEvent.deviceHash).toHaveLength(64);
    expect(JSON.stringify(requestedEvent)).not.toContain(VALID_DEVICE_ID);
  });
});
