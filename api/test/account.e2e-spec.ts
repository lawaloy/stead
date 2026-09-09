import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Account self-service (e2e)', () => {
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
      prisma.consentRecord.deleteMany(),
      prisma.consentPreference.deleteMany(),
      prisma.alertState.deleteMany(),
      prisma.alertPreference.deleteMany(),
      prisma.authEvent.deleteMany(),
      prisma.otpCode.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.notificationJob.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  it('manages, exports, and permanently deletes customer data', async () => {
    await request(app.getHttpServer()).get('/account').expect(401);
    const user = await prisma.user.create({
      data: { phone: '+2348010111222' },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .get('/account')
      .set(auth)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          profile: { phone: user.phone, displayName: null },
          consents: {
            analyticsEnabled: false,
            productResearchEnabled: false,
          },
        });
      });
    await request(app.getHttpServer())
      .patch('/account/profile')
      .set(auth)
      .send({ displayName: '  Ada Lovelace  ' })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          profile: { displayName: string };
        };
        expect(body.profile.displayName).toBe('Ada Lovelace');
      });
    await request(app.getHttpServer())
      .put('/account/consents')
      .set(auth)
      .send({ analyticsEnabled: true, productResearchEnabled: false })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          consents: {
            analyticsEnabled: boolean;
            productResearchEnabled: boolean;
          };
        };
        expect(body.consents).toMatchObject({
          analyticsEnabled: true,
          productResearchEnabled: false,
        });
      });

    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        name: 'Rent',
        amountTotalKobo: 12_000_000n,
        dueDate: new Date('2027-09-08T00:00:00.000Z'),
      },
    });
    await prisma.transaction.create({
      data: {
        userId: user.id,
        goalId: goal.id,
        amountKobo: 100_000n,
        direction: 'in',
        occurredAt: new Date('2026-09-08T00:00:00.000Z'),
      },
    });
    await prisma.authEvent.create({
      data: {
        type: 'otp_verify_succeeded',
        phone: user.phone,
        countryIso: 'NG',
        userId: user.id,
        ip: '192.0.2.1',
        deviceHash: 'not-exported',
      },
    });
    await prisma.authEvent.create({
      data: {
        type: 'otp_request_rate_limited',
        phone: user.phone,
        countryIso: 'NG',
      },
    });
    await prisma.notificationJob.create({
      data: {
        type: 'risk.alert',
        payloadJson: JSON.stringify({ redacted: true }),
        status: 'sent',
        userId: user.id,
        goalId: goal.id,
      },
    });

    await request(app.getHttpServer())
      .get('/account/export')
      .set(auth)
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          authHistory: Array<{
            type: string;
            countryIso: string;
            createdAt: string;
          }>;
        };
        expect(body).toMatchObject({
          schemaVersion: 1,
          profile: { displayName: 'Ada Lovelace' },
          consents: {
            analyticsEnabled: true,
            productResearchEnabled: false,
          },
          goals: [{ id: goal.id, name: 'Rent' }],
          transactions: [{ goalId: goal.id, direction: 'in' }],
          consentHistory: [{ category: 'analytics', granted: true }],
          notificationHistory: [{ type: 'risk.alert', status: 'sent' }],
        });
        expect(
          body.authHistory.map(({ type, countryIso }) => ({
            type,
            countryIso,
          })),
        ).toEqual(
          expect.arrayContaining([
            {
              type: 'otp_verify_succeeded',
              countryIso: 'NG',
            },
            {
              type: 'otp_request_rate_limited',
              countryIso: 'NG',
            },
          ]),
        );
        expect(
          body.authHistory.every(
            (event) => typeof event.createdAt === 'string',
          ),
        ).toBe(true);
        expect(JSON.stringify(body)).not.toContain('192.0.2.1');
        expect(JSON.stringify(body)).not.toContain('not-exported');
        expect(JSON.stringify(body)).not.toContain('payloadJson');
      });

    await request(app.getHttpServer())
      .delete('/account')
      .set(auth)
      .send({ confirmation: 'delete' })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/account')
      .set(auth)
      .send({ confirmation: 'DELETE' })
      .expect(200)
      .expect((response) => {
        const body = response.body as { ok: boolean; deletedAt: string };
        expect(body.ok).toBe(true);
        expect(body.deletedAt).toEqual(expect.any(String));
      });

    await request(app.getHttpServer()).get('/account').set(auth).expect(404);
    await expect(prisma.user.count({ where: { id: user.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.transaction.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationJob.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.consentRecord.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.authEvent.count({ where: { phone: user.phone } }),
    ).resolves.toBe(0);
  });
});
