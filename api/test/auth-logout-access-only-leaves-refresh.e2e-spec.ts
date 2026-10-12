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

describe('Auth access-only logout leaves refresh live (e2e)', () => {
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

  it('does not revoke live families when logout has only a Bearer access JWT', async () => {
    const user = await prisma.user.create({
      data: { phone: '+2348010111777' },
    });
    const other = await prisma.user.create({
      data: { phone: '+2348010111888' },
    });
    await seedLiveRefresh(user.id, 'access-only-family-a');
    await seedLiveRefresh(user.id, 'access-only-family-b');
    await seedLiveRefresh(other.id, 'access-only-other-family');

    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set(auth)
      .send({})
      .expect(200)
      .expect({ ok: true });

    await expect(
      prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).resolves.toBe(2);

    const rotatedA = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'access-only-family-a' })
      .expect(201);
    expect((rotatedA.body as { refreshToken: string }).refreshToken).toEqual(
      expect.any(String),
    );
    expect(
      (rotatedA.body as { refreshToken: string }).refreshToken,
    ).not.toEqual('access-only-family-a');

    const rotatedB = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'access-only-family-b' })
      .expect(201);
    expect((rotatedB.body as { refreshToken: string }).refreshToken).toEqual(
      expect.any(String),
    );

    const otherRotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'access-only-other-family' })
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
