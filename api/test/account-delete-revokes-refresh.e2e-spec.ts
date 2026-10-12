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

describe('Account deletion revokes refresh sessions (e2e)', () => {
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

  it('cascades refresh rows so the leftover token cannot mint a new access JWT', async () => {
    const user = await prisma.user.create({
      data: { phone: '+2348010111222' },
    });
    const rawRefresh = 'delete-account-refresh-token';
    const familyCreatedAt = new Date();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(rawRefresh),
        familyId: randomUUID(),
        familyCreatedAt,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const auth = { Authorization: `Bearer ${token}` };

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rawRefresh })
      .expect(201);
    const liveRefresh = (rotated.body as { refreshToken: string }).refreshToken;
    expect(liveRefresh).toEqual(expect.any(String));
    expect(liveRefresh).not.toEqual(rawRefresh);

    await request(app.getHttpServer())
      .delete('/account')
      .set(auth)
      .send({ confirmation: 'DELETE' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: liveRefresh })
      .expect(401);
    await request(app.getHttpServer()).get('/account').set(auth).expect(404);
    await expect(
      prisma.refreshToken.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });
});
