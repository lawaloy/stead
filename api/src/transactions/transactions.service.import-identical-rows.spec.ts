import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService identical legitimate import rows', () => {
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

  it('previews and confirms both identical rows with distinct fingerprints', async () => {
    const parsed = parseTransactionImport(csv);
    expect(parsed[0].fingerprint).toBeTruthy();
    expect(parsed[1].fingerprint).toBeTruthy();
    expect(parsed[0].fingerprint).not.toBe(parsed[1].fingerprint);

    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.createMany.mockResolvedValue({ count: 2 });

    await expect(
      service.previewImport('user_1', { csv }),
    ).resolves.toMatchObject({
      readyCount: 2,
      duplicateCount: 0,
      invalidCount: 0,
      rows: [
        expect.objectContaining({
          rowNumber: 2,
          duplicate: false,
          fingerprint: parsed[0].fingerprint,
        }),
        expect.objectContaining({
          rowNumber: 3,
          duplicate: false,
          fingerprint: parsed[1].fingerprint,
        }),
      ],
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        importFingerprint: {
          in: [parsed[0].fingerprint, parsed[1].fingerprint],
        },
      },
      select: { importFingerprint: true },
    });

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
          amountKobo: 500_000n,
          note: 'Transfer',
          importFingerprint: parsed[0].fingerprint,
        }),
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
