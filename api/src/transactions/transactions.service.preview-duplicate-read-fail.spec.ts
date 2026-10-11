import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService previewImport when duplicate lookup fails', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { findMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  const csv = [
    'date,description,amount,type',
    '2026-09-01,Salary,1000,income',
  ].join('\n');

  beforeEach(() => {
    prisma = {
      transaction: { findMany: jest.fn() },
      goal: { findFirst: jest.fn() },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces a fingerprint query failure instead of a ready non-duplicate preview', async () => {
    const [row] = parseTransactionImport(csv);
    expect(row.fingerprint).toBeTruthy();

    prisma.transaction.findMany.mockRejectedValue(
      new Error('import fingerprint read unavailable'),
    );

    await expect(service.previewImport('user_1', { csv })).rejects.toThrow(
      'import fingerprint read unavailable',
    );

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        importFingerprint: { in: [row.fingerprint] },
      },
      select: { importFingerprint: true },
    });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });
});
