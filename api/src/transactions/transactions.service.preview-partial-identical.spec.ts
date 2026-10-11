import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService partial identical-row reimport', () => {
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

  const csv = [
    'date,description,amount,type',
    '2026-09-01,Transfer,5000,income',
    '2026-09-01,Transfer,5000,income',
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

  it('marks only the stored occurrence duplicate and imports the remaining identical row', async () => {
    const parsed = parseTransactionImport(csv);
    expect(parsed[0].fingerprint).toBeTruthy();
    expect(parsed[1].fingerprint).toBeTruthy();
    expect(parsed[0].fingerprint).not.toBe(parsed[1].fingerprint);

    prisma.transaction.findMany.mockResolvedValue([
      { importFingerprint: parsed[0].fingerprint },
    ]);
    prisma.transaction.createMany.mockResolvedValue({ count: 1 });

    await expect(
      service.previewImport('user_1', { csv }),
    ).resolves.toMatchObject({
      readyCount: 1,
      duplicateCount: 1,
      invalidCount: 0,
      rows: [
        expect.objectContaining({
          rowNumber: 2,
          duplicate: true,
          fingerprint: parsed[0].fingerprint,
        }),
        expect.objectContaining({
          rowNumber: 3,
          duplicate: false,
          fingerprint: parsed[1].fingerprint,
        }),
      ],
    });

    await expect(
      service.confirmImport('user_1', { csv, rowNumbers: [3] }),
    ).resolves.toEqual({ importedCount: 1, duplicateCount: 0 });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          goalId: null,
          direction: 'in',
          amountKobo: 500_000n,
          note: 'Transfer',
          importFingerprint: parsed[1].fingerprint,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
