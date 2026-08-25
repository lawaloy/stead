import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

const INSPECTION_PATHS = ['/auth/inspection', '/notifications/inspection'];

describe('Operator inspection access (e2e)', () => {
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

  it('rejects unauthenticated and non-operator inspection reads', async () => {
    const outsider = await prisma.user.create({
      data: { phone: '+2348010000001' },
    });
    const outsiderToken = jwt.sign(
      { sub: outsider.id, phone: outsider.phone },
      process.env.JWT_SECRET as string,
    );

    for (const path of INSPECTION_PATHS) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403)
        .expect((response) => {
          expect(response.body).toMatchObject({
            message: 'Operator access required',
          });
        });
    }
  });

  it('allows the configured operator to read both inspection endpoints', async () => {
    const operator = await prisma.user.create({
      data: {
        id: 'operator-e2e',
        phone: '+2348099999999',
      },
    });
    const operatorToken = jwt.sign(
      { sub: operator.id, phone: operator.phone },
      process.env.JWT_SECRET as string,
    );

    await request(app.getHttpServer())
      .get('/auth/inspection')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/notifications/inspection')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
  });

  it('bounds the auth inspection recent window over HTTP, including a zero limit', async () => {
    const operator = await prisma.user.create({
      data: {
        id: 'operator-e2e',
        phone: '+2348099999999',
      },
    });
    const operatorToken = jwt.sign(
      { sub: operator.id, phone: operator.phone },
      process.env.JWT_SECRET as string,
    );

    await prisma.authEvent.createMany({
      data: [
        {
          type: 'otp_requested',
          phone: '+2348010000001',
          countryIso: 'NG',
        },
        {
          type: 'otp_verify_failed',
          phone: '+2348010000002',
          countryIso: 'NG',
        },
        {
          type: 'otp_verify_succeeded',
          phone: '+2348010000003',
          countryIso: 'NG',
        },
      ],
    });

    const bounded = await request(app.getHttpServer())
      .get('/auth/inspection')
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect((bounded.body as { recent: unknown[] }).recent).toHaveLength(2);

    const raisedMinimum = await request(app.getHttpServer())
      .get('/auth/inspection')
      .query({ limit: 0 })
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect((raisedMinimum.body as { recent: unknown[] }).recent).toHaveLength(
      1,
    );
  });

  it('bounds the notification inspection recent window over HTTP, including a zero limit', async () => {
    const operator = await prisma.user.create({
      data: {
        id: 'operator-e2e',
        phone: '+2348099999999',
      },
    });
    const operatorToken = jwt.sign(
      { sub: operator.id, phone: operator.phone },
      process.env.JWT_SECRET as string,
    );
    const redactedPayload = JSON.stringify({ redacted: true });

    await prisma.notificationJob.createMany({
      data: [
        {
          type: 'otp.requested',
          payloadJson: redactedPayload,
          status: 'sent',
        },
        {
          type: 'otp.requested',
          payloadJson: redactedPayload,
          status: 'sent',
        },
        {
          type: 'otp.requested',
          payloadJson: redactedPayload,
          status: 'dead_letter',
        },
      ],
    });

    const bounded = await request(app.getHttpServer())
      .get('/notifications/inspection')
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(
      (bounded.body as { jobs: { recent: unknown[] } }).jobs.recent,
    ).toHaveLength(2);

    const raisedMinimum = await request(app.getHttpServer())
      .get('/notifications/inspection')
      .query({ limit: 0 })
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(
      (raisedMinimum.body as { jobs: { recent: unknown[] } }).jobs.recent,
    ).toHaveLength(1);
  });
});
