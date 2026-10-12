import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

type DashboardBody =
  | { ok: false; message: string }
  | {
      ok: true;
      goal: { id: string };
      metrics: {
        goalSavedKobo: number;
        estimatedBalanceKobo: number;
      };
    };

describe('Finance import into dashboard goal saved (e2e)', () => {
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
      prisma.notificationJob.deleteMany(),
      prisma.otpCode.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  it('nets goal-linked import inflows and outflows on the dashboard', async () => {
    const user = await prisma.user.create({
      data: { phone: '+2348010222333' },
    });
    const token = jwt.sign(
      { sub: user.id, phone: user.phone },
      process.env.JWT_SECRET as string,
    );
    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        name: 'Rent',
        amountTotalKobo: 500_000n,
        dueDate: new Date('2027-01-01T00:00:00.000Z'),
      },
    });
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,2500,income',
      '2026-09-02,Groceries,500,expense',
    ].join('\n');
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .post('/transactions/import')
      .set(auth)
      .send({ csv, rowNumbers: [2, 3], goalId: goal.id })
      .expect(201)
      .expect({ importedCount: 2, duplicateCount: 0 });

    const afterImport = await request(app.getHttpServer())
      .get('/dashboard/stability')
      .set(auth)
      .expect(200);
    expect(afterImport.body as DashboardBody).toMatchObject({
      ok: true,
      goal: { id: goal.id },
      metrics: {
        goalSavedKobo: 200_000,
        estimatedBalanceKobo: 200_000,
      },
    });

    await request(app.getHttpServer())
      .post('/transactions')
      .set(auth)
      .send({
        direction: 'in',
        amountKobo: 100_000,
        occurredAt: '2026-09-03T00:00:00.000Z',
      })
      .expect(201);

    const afterUnlinked = await request(app.getHttpServer())
      .get('/dashboard/stability')
      .set(auth)
      .expect(200);
    expect(afterUnlinked.body as DashboardBody).toMatchObject({
      ok: true,
      goal: { id: goal.id },
      metrics: {
        goalSavedKobo: 200_000,
        estimatedBalanceKobo: 300_000,
      },
    });
  });
});
