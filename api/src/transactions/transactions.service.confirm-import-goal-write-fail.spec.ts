import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService confirmImport persist failure after goal ownership', () => {
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

  it('does not report a successful import when createMany fails after the destination goal is confirmed', async () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Transfer,5000,income',
    ].join('\n');
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.createMany.mockRejectedValue(
      new Error('linked import write unavailable'),
    );

    await expect(
      service.confirmImport('user_1', {
        goalId: 'goal_1',
        csv,
        rowNumbers: [2],
      }),
    ).rejects.toThrow('linked import write unavailable');

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          goalId: 'goal_1',
          direction: 'in',
          amountKobo: 500_000n,
          note: 'Transfer',
          importFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
