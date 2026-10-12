import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import type { TransactionImportPreview } from './../src/contracts/generated/types.gen';

type TransactionBody = {
  id: string;
  userId: string;
  goalId: string | null;
  amountKobo: number;
  direction: 'in' | 'out';
  occurredAt: string;
  note: string | null;
};

describe('Finance provisional debit/credit import (e2e)', () => {
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

  it('previews and idempotently imports provisional debit/credit CSV rows over HTTP', async () => {
    const user = await prisma.user.create({
      data: { phone: '+2348010111001' },
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
      'Value Date,Particulars,Debit,Credit',
      '01-09-2026,Salary,,"NGN 250,000.00"',
      '02-09-2026,Groceries,12500.50,',
      '03-09-2026,Ambiguous,100,200',
    ].join('\n');

    const preview = await request(app.getHttpServer())
      .post('/transactions/import/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv, goalId: goal.id })
      .expect(201);
    expect(preview.body).toMatchObject({
      readyCount: 2,
      duplicateCount: 0,
      invalidCount: 1,
      rows: [
        {
          rowNumber: 2,
          amountKobo: 25_000_000,
          direction: 'in',
          note: 'Salary',
          duplicate: false,
          error: null,
        },
        {
          rowNumber: 3,
          amountKobo: 1_250_050,
          direction: 'out',
          note: 'Groceries',
          duplicate: false,
          error: null,
        },
        {
          rowNumber: 4,
          fingerprint: null,
          duplicate: false,
        },
      ],
    });
    const previewBody = preview.body as TransactionImportPreview;
    expect(previewBody.rows[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(previewBody.rows[1].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(previewBody.rows[2].error).toContain(
      'Amount must be a positive naira value',
    );

    await request(app.getHttpServer())
      .post('/transactions/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv, rowNumbers: [2, 3], goalId: goal.id })
      .expect(201)
      .expect({ importedCount: 2, duplicateCount: 0 });
    await request(app.getHttpServer())
      .post('/transactions/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv, rowNumbers: [2, 3], goalId: goal.id })
      .expect(201)
      .expect({ importedCount: 0, duplicateCount: 2 });
    await request(app.getHttpServer())
      .post('/transactions/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv, rowNumbers: [4], goalId: goal.id })
      .expect(400);

    const listed = await request(app.getHttpServer())
      .get('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body as TransactionBody[]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: user.id,
          goalId: goal.id,
          direction: 'in',
          amountKobo: 25_000_000,
          note: 'Salary',
        }),
        expect.objectContaining({
          userId: user.id,
          goalId: goal.id,
          direction: 'out',
          amountKobo: 1_250_050,
          note: 'Groceries',
        }),
      ]),
    );
    expect(listed.body as TransactionBody[]).toHaveLength(2);
  });
});
