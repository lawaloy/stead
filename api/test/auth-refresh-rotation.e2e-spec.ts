import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Prisma, RefreshToken } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import * as refreshTokens from '../src/auth/refresh-token.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Atomic refresh rotation (PostgreSQL e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: AuthService;
  let jwt: JwtService;
  let userId: string;
  let originalId: string;
  let familyId: string;
  let rawToken: string;

  beforeAll(async () => {
    jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtService)
      .useValue(jwt)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { phone: `refresh-test-${randomUUID()}` },
    });
    userId = user.id;
    familyId = randomUUID();
    rawToken = refreshTokens.generateRefreshToken();
    const row = await prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        familyCreatedAt: new Date(),
        tokenHash: refreshTokens.hashRefreshToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    originalId = row.id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.user.delete({ where: { id: userId } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const assertRotationRolledBack = async () => {
    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: originalId,
      revokedAt: null,
      replacedById: null,
    });
  };

  it('rolls back the predecessor claim when replacement insertion fails', async () => {
    // Force a real unique-key failure after the predecessor has been claimed.
    const generate = jest
      .spyOn(refreshTokens, 'generateRefreshToken')
      .mockReturnValue(rawToken);
    await expect(auth.refreshSession(rawToken)).rejects.toMatchObject({
      code: 'P2002',
    });
    await assertRotationRolledBack();

    generate.mockRestore();
    await expect(auth.refreshSession(rawToken)).resolves.toMatchObject({
      token: expect.any(String) as unknown,
    });
  });

  it('rolls back both rotation writes when JWT signing fails and permits retry', async () => {
    const signing = jest
      .spyOn(jwt, 'signAsync')
      .mockRejectedValueOnce(new Error('signing unavailable'));
    await expect(auth.refreshSession(rawToken)).rejects.toThrow(
      'signing unavailable',
    );
    await assertRotationRolledBack();

    signing.mockRestore();
    const session = await auth.refreshSession(rawToken);
    const original = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: originalId },
    });
    const replacement = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        tokenHash: refreshTokens.hashRefreshToken(session.refreshToken),
      },
    });
    expect(original.revokedAt).toBeInstanceOf(Date);
    expect(original.replacedById).toBe(replacement.id);
    expect(replacement.familyId).toBe(familyId);
    expect(replacement.familyCreatedAt).toEqual(original.familyCreatedAt);
    expect(replacement.revokedAt).toBeNull();
  });

  it('allows only one concurrent rotation and revokes its replacement on reuse', async () => {
    // Both requests must read the live predecessor before either claims it.
    const findUnique = prisma.refreshToken.findUnique.bind(
      prisma.refreshToken,
    ) as (
      args: Prisma.RefreshTokenFindUniqueArgs,
    ) => Promise<RefreshToken | null>;
    let lookups = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(prisma.refreshToken, 'findUnique')
      .mockImplementation(async (args: Prisma.RefreshTokenFindUniqueArgs) => {
        const row = await findUnique(args);
        if (
          args.include?.user &&
          args.where.tokenHash === refreshTokens.hashRefreshToken(rawToken)
        ) {
          lookups += 1;
          if (lookups === 2) release();
          await bothRead;
        }
        return row;
      });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rawToken }),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rawToken }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);
    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    const winner = responses.find((response) => response.status === 201)!;
    const session = winner.body as { refreshToken: string };
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });
});
