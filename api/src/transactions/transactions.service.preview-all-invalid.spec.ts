import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService preview of an all-invalid statement', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { findMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      goal: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('returns zero ready rows and still queries an empty fingerprint set', async () => {
    const csv = [
      'date,description,amount,type',
      '09/01/2026,,zero,transfer',
      'bad,Invalid,20,expense',
    ].join('\n');

    const preview = await service.previewImport('user_1', { csv });

    expect(preview).toMatchObject({
      readyCount: 0,
      duplicateCount: 0,
      invalidCount: 2,
    });
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows.every((row) => row.fingerprint === null)).toBe(true);
    expect(preview.rows.every((row) => typeof row.error === 'string')).toBe(
      true,
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        importFingerprint: { in: [] },
      },
      select: { importFingerprint: true },
    });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });
});
