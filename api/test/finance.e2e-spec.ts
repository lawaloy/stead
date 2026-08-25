import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

type GoalBody = {
  id: string;
  userId: string;
  name: string;
  amountTotalKobo: number;
  dueDate: string;
  monthlyIncomeKobo: number | null;
  isActive: boolean;
};

type TransactionBody = {
  id: string;
  userId: string;
  goalId: string | null;
  amountKobo: number;
  direction: 'in' | 'out';
  occurredAt: string;
  note: string | null;
};

type DashboardBody =
  | { ok: false; message: string }
  | {
      ok: true;
      goal: {
        id: string;
        name: string;
        amountTotalKobo: number;
        dueDate: string;
        monthlyIncomeKobo: number | null;
      };
      metrics: {
        remainingObligationKobo: number;
        readinessPct: number;
        goalSavedKobo: number;
        estimatedBalanceKobo: number;
        safeToSpendKobo: number;
      };
    };

describe('Finance flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userSeq = 0;

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

  async function createAuthedUser() {
    userSeq += 1;
    const phone = `+2348010${String(userSeq).padStart(6, '0')}`;
    const user = await prisma.user.create({
      data: { phone },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );

    return { user, token };
  }

  function authed(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token: string,
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${token}`);
  }

  it('rejects unauthenticated finance reads and writes', async () => {
    await request(app.getHttpServer()).get('/goals/active').expect(401);
    await request(app.getHttpServer())
      .post('/goals')
      .send({
        name: 'Rent',
        amountTotalKobo: 100_000,
        dueDate: '2026-12-01T00:00:00.000Z',
      })
      .expect(401);
    await request(app.getHttpServer()).get('/transactions').expect(401);
    await request(app.getHttpServer()).get('/dashboard/stability').expect(401);
  });

  it('creates a goal, records in/out transactions, and aggregates dashboard metrics', async () => {
    const { user, token } = await createAuthedUser();
    const dueDate = '2099-01-15T00:00:00.000Z';

    const createdGoal = await authed('post', '/goals', token)
      .send({
        name: 'School fees',
        amountTotalKobo: 500_000,
        dueDate,
        monthlyIncomeKobo: 400_000,
      })
      .expect(201);
    const goal = createdGoal.body as GoalBody;

    expect(goal).toMatchObject({
      userId: user.id,
      name: 'School fees',
      amountTotalKobo: 500_000,
      monthlyIncomeKobo: 400_000,
      isActive: true,
    });

    const linkedIn = await authed('post', '/transactions', token)
      .send({
        direction: 'in',
        amountKobo: 200_000,
        occurredAt: '2026-01-02T00:00:00.000Z',
        goalId: goal.id,
        note: 'Salary slice',
      })
      .expect(201);
    await authed('post', '/transactions', token)
      .send({
        direction: 'out',
        amountKobo: 50_000,
        occurredAt: '2026-01-03T00:00:00.000Z',
        goalId: goal.id,
      })
      .expect(201);
    await authed('post', '/transactions', token)
      .send({
        direction: 'in',
        amountKobo: 30_000,
        occurredAt: '2026-01-04T00:00:00.000Z',
      })
      .expect(201);

    const listed = await authed('get', '/transactions', token).expect(200);
    expect(listed.body as TransactionBody[]).toHaveLength(3);

    const dashboard = await authed('get', '/dashboard/stability', token).expect(
      200,
    );
    const body = dashboard.body as DashboardBody;

    expect(body).toMatchObject({
      ok: true,
      goal: {
        id: goal.id,
        name: 'School fees',
        amountTotalKobo: 500_000,
        monthlyIncomeKobo: 400_000,
      },
      metrics: {
        remainingObligationKobo: 350_000,
        readinessPct: 30,
        goalSavedKobo: 150_000,
        estimatedBalanceKobo: 180_000,
        safeToSpendKobo: 0,
      },
    });

    const linkedInBody = linkedIn.body as TransactionBody;
    await authed('patch', `/transactions/${linkedInBody.id}`, token)
      .send({ amountKobo: 250_000 })
      .expect(200);

    const afterUpdate = await authed(
      'get',
      '/dashboard/stability',
      token,
    ).expect(200);
    expect(afterUpdate.body as DashboardBody).toMatchObject({
      ok: true,
      metrics: {
        goalSavedKobo: 200_000,
        estimatedBalanceKobo: 230_000,
        remainingObligationKobo: 300_000,
      },
    });
  });

  it('keeps a single active goal when creating a replacement or reactivating an older one', async () => {
    const { user, token } = await createAuthedUser();

    const first = await authed('post', '/goals', token)
      .send({
        name: 'First',
        amountTotalKobo: 100_000,
        dueDate: '2026-06-01T00:00:00.000Z',
      })
      .expect(201);
    const firstGoal = first.body as GoalBody;

    const second = await authed('post', '/goals', token)
      .send({
        name: 'Second',
        amountTotalKobo: 200_000,
        dueDate: '2026-07-01T00:00:00.000Z',
      })
      .expect(201);
    const secondGoal = second.body as GoalBody;

    const afterCreate = await authed('get', '/goals/active', token).expect(200);
    expect(afterCreate.body as GoalBody).toMatchObject({
      id: secondGoal.id,
      name: 'Second',
      isActive: true,
    });
    await expect(
      prisma.goal.count({ where: { userId: user.id, isActive: true } }),
    ).resolves.toBe(1);

    await authed('patch', `/goals/${firstGoal.id}`, token)
      .send({ isActive: true })
      .expect(200);

    const afterReactivate = await authed('get', '/goals/active', token).expect(
      200,
    );
    expect(afterReactivate.body as GoalBody).toMatchObject({
      id: firstGoal.id,
      isActive: true,
    });
    await expect(
      prisma.goal.count({ where: { userId: user.id, isActive: true } }),
    ).resolves.toBe(1);
  });

  it('enforces the one-active-goal unique index when a second active row is inserted', async () => {
    const { user, token } = await createAuthedUser();
    await authed('post', '/goals', token)
      .send({
        name: 'Only',
        amountTotalKobo: 100_000,
        dueDate: '2026-06-01T00:00:00.000Z',
      })
      .expect(201);

    await expect(
      prisma.goal.create({
        data: {
          userId: user.id,
          name: 'Rogue second active',
          amountTotalKobo: 50_000n,
          dueDate: new Date('2026-08-01T00:00:00.000Z'),
          isActive: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes goals, transactions, and dashboard totals to the authenticated user', async () => {
    const owner = await createAuthedUser();
    const other = await createAuthedUser();

    const ownerGoal = (
      await authed('post', '/goals', owner.token)
        .send({
          name: 'Owner goal',
          amountTotalKobo: 400_000,
          dueDate: '2026-09-01T00:00:00.000Z',
        })
        .expect(201)
    ).body as GoalBody;

    const ownerTx = (
      await authed('post', '/transactions', owner.token)
        .send({
          direction: 'in',
          amountKobo: 80_000,
          occurredAt: '2026-01-10T00:00:00.000Z',
          goalId: ownerGoal.id,
        })
        .expect(201)
    ).body as TransactionBody;

    await authed('get', '/goals/active', other.token).expect(404);
    await authed('patch', `/goals/${ownerGoal.id}`, other.token)
      .send({ name: 'Hijacked' })
      .expect(404);
    await authed('post', '/transactions', other.token)
      .send({
        direction: 'in',
        amountKobo: 10_000,
        occurredAt: '2026-01-11T00:00:00.000Z',
        goalId: ownerGoal.id,
      })
      .expect(404);
    await authed('patch', `/transactions/${ownerTx.id}`, other.token)
      .send({ note: 'not yours' })
      .expect(404);
    await authed('delete', `/transactions/${ownerTx.id}`, other.token).expect(
      404,
    );

    const otherGoal = (
      await authed('post', '/goals', other.token)
        .send({
          name: 'Other goal',
          amountTotalKobo: 50_000,
          dueDate: '2026-10-01T00:00:00.000Z',
        })
        .expect(201)
    ).body as GoalBody;
    await authed('post', '/transactions', other.token)
      .send({
        direction: 'in',
        amountKobo: 5_000,
        occurredAt: '2026-01-12T00:00:00.000Z',
        goalId: otherGoal.id,
      })
      .expect(201);

    const otherList = await authed('get', '/transactions', other.token).expect(
      200,
    );
    expect(otherList.body as TransactionBody[]).toEqual([
      expect.objectContaining({ amountKobo: 5_000, goalId: otherGoal.id }),
    ]);
    expect(
      (otherList.body as TransactionBody[]).some(
        (row) => row.id === ownerTx.id,
      ),
    ).toBe(false);

    const ownerDashboard = await authed(
      'get',
      '/dashboard/stability',
      owner.token,
    ).expect(200);
    expect(ownerDashboard.body as DashboardBody).toMatchObject({
      ok: true,
      goal: { id: ownerGoal.id },
      metrics: {
        goalSavedKobo: 80_000,
        estimatedBalanceKobo: 80_000,
      },
    });
  });

  it('rejects zero-amount goals and transactions through the HTTP validation pipe', async () => {
    const { token } = await createAuthedUser();

    await authed('post', '/goals', token)
      .send({
        name: 'Invalid',
        amountTotalKobo: 0,
        dueDate: '2026-06-01T00:00:00.000Z',
      })
      .expect(400);

    await authed('post', '/transactions', token)
      .send({
        direction: 'in',
        amountKobo: 0,
        occurredAt: '2026-01-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('deletes an owned transaction and drops it from dashboard totals', async () => {
    const { token } = await createAuthedUser();
    const goal = (
      await authed('post', '/goals', token)
        .send({
          name: 'Rent',
          amountTotalKobo: 300_000,
          dueDate: '2026-11-01T00:00:00.000Z',
        })
        .expect(201)
    ).body as GoalBody;
    const tx = (
      await authed('post', '/transactions', token)
        .send({
          direction: 'in',
          amountKobo: 40_000,
          occurredAt: '2026-01-20T00:00:00.000Z',
          goalId: goal.id,
        })
        .expect(201)
    ).body as TransactionBody;

    await authed('delete', `/transactions/${tx.id}`, token)
      .expect(200)
      .expect({ ok: true });

    const dashboard = await authed('get', '/dashboard/stability', token).expect(
      200,
    );
    expect(dashboard.body as DashboardBody).toMatchObject({
      ok: true,
      metrics: {
        goalSavedKobo: 0,
        estimatedBalanceKobo: 0,
        remainingObligationKobo: 300_000,
      },
    });
  });
});
