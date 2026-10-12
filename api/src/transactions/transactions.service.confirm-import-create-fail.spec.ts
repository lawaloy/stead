import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService confirmImport persist failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { createMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      transaction: { createMany: jest.fn() },
      goal: { findFirst: jest.fn() },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces a createMany failure instead of reporting a successful empty import', async () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Transfer,5000,income',
    ].join('\n');
    prisma.transaction.createMany.mockRejectedValue(
      new Error('import write unavailable'),
    );

    await expect(
      service.confirmImport('user_1', { csv, rowNumbers: [2] }),
    ).rejects.toThrow('import write unavailable');

    expect(prisma.transaction.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          goalId: null,
          direction: 'in',
          amountKobo: 500_000n,
          note: 'Transfer',
          importFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });
});
