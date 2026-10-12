import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashRefreshToken } from '../src/auth/refresh-token.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth logout allDevices via Bearer only (e2e)', () => {
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
      prisma.refreshToken.deleteMany(),
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

  async function seedLiveRefresh(userId: string, rawRefresh: string) {
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(rawRefresh),
        familyId: randomUUID(),
        familyCreatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  it('revokes every live family from an access JWT without a refresh body', async () => {
    const user = await prisma.user.create({
      data: { phone: '+2348010111333' },
    });
    const other = await prisma.user.create({
      data: { phone: '+2348010111444' },
    });
    await seedLiveRefresh(user.id, 'alldevices-family-a');
    await seedLiveRefresh(user.id, 'alldevices-family-b');
    await seedLiveRefresh(other.id, 'alldevices-other-family');

    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const auth = { Authorization: `Bearer ${token}` };

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'alldevices-family-a' })
      .expect(201);
    const liveFamilyA = (rotated.body as { refreshToken: string }).refreshToken;
    expect(liveFamilyA).toEqual(expect.any(String));
    expect(liveFamilyA).not.toEqual('alldevices-family-a');

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set(auth)
      .send({ allDevices: true })
      .expect(200)
      .expect({ ok: true });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: liveFamilyA })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'alldevices-family-b' })
      .expect(401);

    await expect(
      prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).resolves.toBe(0);

    const otherRotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'alldevices-other-family' })
      .expect(201);
    expect(
      (otherRotated.body as { refreshToken: string }).refreshToken,
    ).toEqual(expect.any(String));

    const account = await request(app.getHttpServer())
      .get('/account')
      .set(auth)
      .expect(200);
    expect(account.body).toMatchObject({
      profile: { id: user.id, phone: user.phone },
    });
  });
});
