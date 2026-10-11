import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService list when the ledger read fails', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces a findMany failure instead of an empty ledger', async () => {
    prisma.transaction.findMany.mockRejectedValue(
      new Error('transaction list unavailable'),
    );

    await expect(
      service.list('user_1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.000Z',
      }),
    ).rejects.toThrow('transaction list unavailable');

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-31T23:59:59.000Z'),
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });
});
