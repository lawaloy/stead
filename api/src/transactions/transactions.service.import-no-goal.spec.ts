import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService confirmImport without goal linkage', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      createMany: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        createMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('persists selected rows with a null goalId when linkage is omitted', async () => {
    prisma.transaction.createMany.mockResolvedValue({ count: 2 });
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,1000,income',
      '2026-09-02,Food,50.25,expense',
    ].join('\n');
    const parsed = parseTransactionImport(csv);

    await expect(
      service.confirmImport('user_1', { csv, rowNumbers: [2, 3] }),
    ).resolves.toEqual({ importedCount: 2, duplicateCount: 0 });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          goalId: null,
          direction: 'in',
          amountKobo: 100_000n,
          note: 'Salary',
          importFingerprint: parsed[0].fingerprint,
        }),
        expect.objectContaining({
          userId: 'user_1',
          goalId: null,
          direction: 'out',
          amountKobo: 5_025n,
          note: 'Food',
          importFingerprint: parsed[1].fingerprint,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
