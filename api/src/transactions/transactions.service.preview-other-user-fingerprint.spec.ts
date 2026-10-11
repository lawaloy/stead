import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService preview duplicate isolation', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const csv = [
    'date,description,amount,type',
    '2026-09-01,Salary,1000,income',
  ].join('\n');

  beforeEach(() => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('does not mark another user fingerprint as a duplicate for this preview', async () => {
    const [row] = parseTransactionImport(csv);
    expect(row.fingerprint).toBeTruthy();

    prisma.transaction.findMany.mockImplementation(
      (args: {
        where: { userId: string; importFingerprint: { in: string[] } };
      }) => {
        expect(args.where.userId).toBe('user_1');
        expect(args.where.importFingerprint.in).toEqual([row.fingerprint]);
        return Promise.resolve([]);
      },
    );

    await expect(
      service.previewImport('user_1', { csv }),
    ).resolves.toMatchObject({
      readyCount: 1,
      duplicateCount: 0,
      invalidCount: 0,
      rows: [
        expect.objectContaining({
          rowNumber: 2,
          duplicate: false,
          fingerprint: row.fingerprint,
          error: null,
        }),
      ],
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
  });
});
