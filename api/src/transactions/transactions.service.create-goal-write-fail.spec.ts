import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService linked create persist failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');

  beforeEach(() => {
    prisma = {
      transaction: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('does not return a serialized transaction when a linked create persist fails', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.create.mockRejectedValue(
      new Error('linked create unavailable'),
    );

    await expect(
      service.create('user_1', {
        goalId: 'goal_1',
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        note: 'Rent',
      }),
    ).rejects.toThrow('linked create unavailable');

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: 'goal_1',
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt,
        note: 'Rent',
      },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });
});
