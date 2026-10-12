import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Account deletion of legacy notification jobs (e2e)', () => {
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

  it('deletes phone-matched legacy jobs and keeps other-phone leftovers', async () => {
    const user = await prisma.user.create({
      data: { phone: '+2348010111222' },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const linked = await prisma.notificationJob.create({
      data: {
        type: 'risk.alert',
        payloadJson: JSON.stringify({
          phone: user.phone,
          body: 'linked risk',
        }),
        status: 'sent',
        userId: user.id,
      },
    });
    const legacyMatch = await prisma.notificationJob.create({
      data: {
        type: 'risk.recovery',
        payloadJson: JSON.stringify({
          phone: user.phone,
          body: 'legacy recovery',
        }),
        status: 'pending',
        userId: null,
      },
    });
    const legacyOther = await prisma.notificationJob.create({
      data: {
        type: 'risk.alert',
        payloadJson: JSON.stringify({
          phone: '+2348111111111',
          body: 'other phone risk',
        }),
        status: 'pending',
        userId: null,
      },
    });

    await request(app.getHttpServer())
      .delete('/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DELETE' })
      .expect(200)
      .expect((response) => {
        const body = response.body as { ok: boolean; deletedAt: string };
        expect(body.ok).toBe(true);
        expect(body.deletedAt).toEqual(expect.any(String));
      });

    await expect(prisma.user.count({ where: { id: user.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.notificationJob.count({ where: { id: linked.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationJob.count({ where: { id: legacyMatch.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.notificationJob.findUnique({ where: { id: legacyOther.id } }),
    ).resolves.toMatchObject({
      id: legacyOther.id,
      userId: null,
    });
  });
});
