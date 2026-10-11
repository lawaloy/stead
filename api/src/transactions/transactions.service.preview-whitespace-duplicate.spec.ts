import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService preview of whitespace-equivalent imports', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const storedCsv = [
    'date,description,amount,type',
    '2026-09-01,Rent buffer,100,expense',
  ].join('\n');
  const paddedCsv = [
    'date,description,amount,type',
    '2026-09-01,Rent  buffer,100,expense',
  ].join('\n');

  beforeEach(() => {
    prisma = {
      transaction: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('marks a padded narration as a duplicate of the stored collapsed fingerprint', async () => {
    const stored = parseTransactionImport(storedCsv);
    const padded = parseTransactionImport(paddedCsv);
    expect(padded[0].fingerprint).toBe(stored[0].fingerprint);

    prisma.transaction.findMany.mockResolvedValue([
      { importFingerprint: stored[0].fingerprint },
    ]);
    prisma.transaction.createMany.mockResolvedValue({ count: 0 });

    await expect(
      service.previewImport('user_1', { csv: paddedCsv }),
    ).resolves.toMatchObject({
      readyCount: 0,
      duplicateCount: 1,
      invalidCount: 0,
      rows: [
        expect.objectContaining({
          rowNumber: 2,
          duplicate: true,
          fingerprint: stored[0].fingerprint,
          note: 'Rent buffer',
          error: null,
        }),
      ],
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        importFingerprint: { in: [stored[0].fingerprint] },
      },
      select: { importFingerprint: true },
    });

    await expect(
      service.confirmImport('user_1', { csv: paddedCsv, rowNumbers: [2] }),
    ).resolves.toEqual({ importedCount: 0, duplicateCount: 1 });
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          note: 'Rent buffer',
          importFingerprint: stored[0].fingerprint,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
