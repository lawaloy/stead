import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AlertsService } from '../src/alerts/alerts.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Readiness alerts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let alerts: AlertsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    alerts = app.get(AlertsService);
  });

  beforeEach(async () => cleanDatabase());
  afterEach(async () => cleanDatabase());
  afterAll(async () => app.close());

  async function cleanDatabase() {
    if (!prisma) return;
    await prisma.$transaction([
      prisma.alertState.deleteMany(),
      prisma.alertPreference.deleteMany(),
      prisma.authEvent.deleteMany(),
      prisma.otpCode.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.user.deleteMany(),
      prisma.notificationJob.deleteMany(),
    ]);
  }

  async function customer() {
    const user = await prisma.user.create({
      data: { phone: '+2348010999999' },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    return { user, token };
  }

  it('persists preferences and delivers one encrypted weekly job', async () => {
    await request(app.getHttpServer()).get('/alerts/preferences').expect(401);
    const { user, token } = await customer();
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .get('/alerts/preferences')
      .set(auth)
      .expect(200)
      .expect({
        weeklySummaryEnabled: false,
        riskAlertsEnabled: false,
        channel: 'sms',
        timeZone: 'UTC',
        weeklyDay: 1,
        weeklyHourLocal: 9,
        updatedAt: null,
      });
    await request(app.getHttpServer())
      .patch('/alerts/preferences')
      .set(auth)
      .send({ timeZone: 'Not/AZone' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/alerts/preferences')
      .set(auth)
      .send({
        weeklySummaryEnabled: true,
        timeZone: 'Africa/Lagos',
        weeklyDay: 1,
        weeklyHourLocal: 9,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          weeklySummaryEnabled: true,
          riskAlertsEnabled: false,
          channel: 'sms',
          timeZone: 'Africa/Lagos',
        });
      });

    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        name: 'Rent',
        amountTotalKobo: 10_000_000n,
        dueDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    });
    const now = new Date('2026-09-07T10:00:00.000Z');
    await alerts.evaluateUser(user.id, now);
    await alerts.evaluateUser(user.id, now);

    const deadline = Date.now() + 10_000;
    let job = await prisma.notificationJob.findFirst({
      where: { type: 'weekly.summary' },
    });
    while (job?.status !== 'sent' && Date.now() < deadline) {
      await delay(100);
      job = await prisma.notificationJob.findFirst({
        where: { type: 'weekly.summary' },
      });
    }

    expect(job).toMatchObject({
      status: 'sent',
      provider: 'dev',
      userId: user.id,
      goalId: goal.id,
      dedupeKey: `weekly:${user.id}:${goal.id}:2026-09-06`,
      payloadJson: JSON.stringify({ redacted: true }),
    });
    await expect(
      prisma.notificationJob.count({ where: { type: 'weekly.summary' } }),
    ).resolves.toBe(1);
  });
});
