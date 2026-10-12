import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService ownership lookup failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('does not treat a transaction-ownership outage as a missing row', async () => {
    const failure = new Error('transaction ownership lookup unavailable');
    prisma.transaction.findFirst.mockRejectedValue(failure);

    const error = await service
      .update('user_1', 'tx_1', { amountKobo: 9_000 })
      .catch((reason: unknown) => reason);

    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(NotFoundException);
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });
});
