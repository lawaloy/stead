import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PHONE = '+2348010111777';

describe('Account partial consent update (e2e)', () => {
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
      prisma.notificationJob.deleteMany(),
      prisma.otpCode.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  it('revokes analytics without wiping the stored product-research flag', async () => {
    const user = await prisma.user.create({
      data: { phone: PHONE },
    });
    await prisma.consentPreference.create({
      data: {
        userId: user.id,
        analyticsEnabled: true,
        productResearchEnabled: true,
      },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .put('/account/consents')
      .set(auth)
      .send({ analyticsEnabled: false })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          consents: {
            analyticsEnabled: false,
            productResearchEnabled: true,
          },
        });
      });

    const stored = await prisma.consentPreference.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(stored.analyticsEnabled).toBe(false);
    expect(stored.productResearchEnabled).toBe(true);

    const records = await prisma.consentRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(records).toEqual([
      expect.objectContaining({
        category: 'analytics',
        granted: false,
      }),
    ]);
  });
});
